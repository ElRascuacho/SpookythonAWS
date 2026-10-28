import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_SECONDS = 8 * 60 * 60;
const COOKIE = "manta_session";
const WINDOW_MS = 60_000;
// shortcut: rate limit por proceso; usar un límite compartido/WAF antes de escalar a varias instancias.
const attempts = new Map<string, { count: number; until: number }>();
type Environment = Record<string, string | undefined>;

export function hashInvitation(code: string): string {
  return createHash("sha256")
    .update(code.replace(/[\s-]/g, "").toUpperCase())
    .digest("hex");
}

export function json(
  status: number,
  body: object,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Handles auth routes; null means an authenticated API request may continue. */
export async function authorize(
  request: Request,
  clientIp: string,
  env: Environment = process.env,
  now = Date.now(),
): Promise<Response | null> {
  const secret = env.INVITE_SESSION_SECRET ?? "";
  // La cuenta demo es pública; desactívala si el despliegue requiere acceso privado.
  const demoEnabled = env.DEMO_LOGIN_ENABLED !== "false";
  const demoId = createHash("sha256").update("demo:manta-cero").digest("hex");
  const email = (env.LOGIN_EMAIL ?? "").trim().toLowerCase();
  const passwordHash = env.LOGIN_PASSWORD_SCRYPT ?? "";
  const accountConfigured = !!email && /^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(passwordHash);
  const accountId = createHash("sha256").update(`account:${email}:${passwordHash}`).digest("hex");
  const hashes = (env.INVITE_CODE_HASHES ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  const origin = env.INVITE_APP_ORIGIN ?? "";
  let appUrl: URL;
  try {
    appUrl = new URL(origin);
  } catch {
    return json(503, {
      error: "El acceso todavía no está configurado. Contacta al administrador.",
    });
  }
  const secure = appUrl.protocol === "https:";
  if (
    (Boolean(env.AWS_LAMBDA_FUNCTION_NAME) && !secure) ||
    !/^[a-f0-9]{64}$/i.test(secret) ||
    !hashes.every((h) => /^[a-f0-9]{64}$/.test(h)) ||
    appUrl.origin !== origin ||
    (!secure &&
      (appUrl.protocol !== "http:" ||
        !["localhost", "127.0.0.1"].includes(appUrl.hostname)))
  ) {
    return json(503, {
      error: "El acceso todavía no está configurado. Contacta al administrador.",
    });
  }
  const path = new URL(request.url).pathname;
  const sign = (value: string) =>
    createHmac("sha256", secret).update(value).digest("base64url");
  const cookie = (token: string, age: number) =>
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;

  if (request.method !== "GET") {
    const reqOrigin = request.headers.get("origin");
    if (reqOrigin !== origin)
      return json(403, { error: "Origen no permitido." });
    if (request.method !== "POST")
      return json(
        405,
        { error: "Método no permitido." },
        { Allow: "GET, POST" },
      );
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    ) {
      return json(415, { error: "Se requiere JSON." });
    }
  }

  if (path === "/api/auth/login") {
    if (request.method !== "POST")
      return json(405, { error: "Método no permitido." }, { Allow: "POST" });
    for (const [ip, record] of attempts)
      if (record.until <= now) attempts.delete(ip);
    const record = attempts.get(clientIp) ?? {
      count: 0,
      until: now + WINDOW_MS,
    };
    if (
      record.count >= 5 ||
      (!attempts.has(clientIp) && attempts.size >= 10_000)
    ) {
      return json(
        429,
        { error: "Demasiados intentos. Espera un minuto y vuelve a probar." },
        { "Retry-After": "60" },
      );
    }
    record.count++;
    attempts.set(clientIp, record);
    const body = await request.text();
    if (Buffer.byteLength(body) > 4096)
      return json(413, { error: "Solicitud demasiado grande." });
    let credentials: { email?: unknown; password?: unknown; code?: unknown };
    try {
      credentials = JSON.parse(body) ?? {};
    } catch {
      return json(400, { error: "Solicitud inválida." });
    }
    let hash = "";
    if (typeof credentials.email === "string" && typeof credentials.password === "string" &&
        credentials.email.length <= 254 && credentials.password.length <= 256) {
      const suppliedEmail = credentials.email.trim().toLowerCase();
      if (demoEnabled && equal(suppliedEmail, "demo@mantacero.com") && equal(credentials.password, "Demo2026!")) {
        hash = demoId;
      } else if (accountConfigured && equal(suppliedEmail, email)) {
        const [salt, expected] = passwordHash.split(":");
        const actual = scryptSync(credentials.password, Buffer.from(salt, "hex"), 64).toString("hex");
        if (equal(actual, expected.toLowerCase())) hash = accountId;
      }
    } else if (typeof credentials.code === "string" && credentials.code.length <= 100 &&
        /^MC[0-9A-F]{20}$/.test(credentials.code.replace(/[\s-]/g, "").toUpperCase())) {
      // Compatibilidad con integraciones anteriores; la pantalla ya no solicita invitaciones.
      const legacyHash = hashInvitation(credentials.code);
      if (hashes.some((h) => equal(h, legacyHash))) hash = legacyHash;
    }
    if (!hash) return json(401, { error: "Correo o contraseña incorrectos." });
    const expiresAt = now + SESSION_SECONDS * 1000;
    const payload = `${hash}.${expiresAt}.${randomBytes(16).toString("hex")}`;
    return json(
      200,
      { expiresAt },
      { "Set-Cookie": cookie(`${payload}.${sign(payload)}`, SESSION_SECONDS) },
    );
  }

  if (path === "/api/auth/logout") {
    if (request.method !== "POST")
      return json(405, { error: "Método no permitido." }, { Allow: "POST" });
    // shortcut: logout elimina la cookie; un token robado vive hasta caducar. Rotar la clave para revocar todos.
    return json(200, { ok: true }, { "Set-Cookie": cookie("", 0) });
  }

  const token =
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1) ?? "";
  const [hash, expiry, nonce, signature, extra] = token.split(".");
  const expiresAt = Number(expiry);
  if (
    extra !== undefined ||
    !hash ||
    !nonce ||
    !signature ||
    token.length > 512 ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + SESSION_SECONDS * 1000 ||
    (!hashes.includes(hash) && !(demoEnabled && equal(hash, demoId)) && !(accountConfigured && equal(hash, accountId))) ||
    !equal(sign(`${hash}.${expiry}.${nonce}`), signature)
  ) {
    return json(
      401,
      { error: "Tu sesión terminó. Inicia sesión para volver a entrar." },
      { "Set-Cookie": cookie("", 0) },
    );
  }
  if (path === "/api/auth/session") {
    return request.method === "GET"
      ? json(200, { expiresAt })
      : json(405, { error: "Método no permitido." }, { Allow: "GET" });
  }
  return null;
}
