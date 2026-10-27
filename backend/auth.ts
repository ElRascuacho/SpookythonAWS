import {
  createHash,
  createHmac,
  randomBytes,
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
  const hashes = (env.INVITE_CODE_HASHES ?? "").split(",").map((h) => h.trim());
  const origin = env.INVITE_APP_ORIGIN ?? "";
  let appUrl: URL;
  try {
    appUrl = new URL(origin);
  } catch {
    return json(503, {
      error:
        "El acceso todavía no está configurado. Contacta a quien te invitó.",
    });
  }
  const secure = appUrl.protocol === "https:";
  if (
    !/^[a-f0-9]{64}$/i.test(secret) ||
    !hashes.every((h) => /^[a-f0-9]{64}$/.test(h)) ||
    appUrl.origin !== origin ||
    (!secure &&
      (appUrl.protocol !== "http:" ||
        !["localhost", "127.0.0.1"].includes(appUrl.hostname)))
  ) {
    return json(503, {
      error:
        "El acceso todavía no está configurado. Contacta a quien te invitó.",
    });
  }
  const path = new URL(request.url).pathname;
  const sign = (value: string) =>
    createHmac("sha256", secret).update(value).digest("base64url");
  const cookie = (token: string, age: number) =>
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;

  if (request.method !== "GET") {
    const reqOrigin = request.headers.get("origin");
    const isCloudFront = typeof reqOrigin === "string" && reqOrigin.startsWith("https://") && reqOrigin.endsWith(".cloudfront.net");
    if (reqOrigin !== origin && !isCloudFront)
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
    let code: unknown;
    try {
      code = JSON.parse(body)?.code;
    } catch {
      return json(400, { error: "Solicitud inválida." });
    }
    if (
      typeof code !== "string" ||
      code.length > 100 ||
      !/^MC[0-9A-F]{20}$/.test(code.replace(/[\s-]/g, "").toUpperCase())
    ) {
      return json(401, {
        error: "Código no válido. Revisa la invitación e inténtalo de nuevo.",
      });
    }
    const hash = hashInvitation(code);
    if (!hashes.some((h) => equal(h, hash)))
      return json(401, {
        error: "Código no válido. Revisa la invitación e inténtalo de nuevo.",
      });
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
    !hashes.includes(hash) ||
    !equal(sign(`${hash}.${expiry}.${nonce}`), signature)
  ) {
    return json(
      401,
      { error: "Tu sesión terminó. Ingresa el código para volver a entrar." },
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
