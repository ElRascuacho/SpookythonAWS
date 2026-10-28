import { describe, expect, test } from "bun:test";
import { scryptSync } from "node:crypto";
import { authorize, hashInvitation, ownerHash, SESSION_SECONDS } from "../auth";

const code = "MC-01234-56789-ABCDE-F0123";
const env = {
  INVITE_CODE_HASHES: hashInvitation(code),
  INVITE_SESSION_SECRET: "ab".repeat(32),
  INVITE_APP_ORIGIN: "https://manta.example",
};
const now = 1_800_000_000_000;
const request = (path: string, options: RequestInit = {}) =>
  new Request(`${env.INVITE_APP_ORIGIN}/api/auth/${path}`, options);
const post = (
  body = JSON.stringify({ code }),
  origin = env.INVITE_APP_ORIGIN,
): RequestInit => ({
  method: "POST",
  headers: { origin, "Content-Type": "application/json" },
  body,
});
async function login(ip: string, body?: string) {
  const response = (await authorize(
    request("login", post(body)),
    ip,
    env,
    now,
  ))!;
  return {
    response,
    cookie: response.headers.get("set-cookie")!.split(";")[0],
  };
}

describe("Email authentication", () => {
  test("demo credentials create a session and disabling demo revokes it", async () => {
    const demoEnv = { ...env, INVITE_CODE_HASHES: "" };
    const credentials = JSON.stringify({ email: "demo@mantacero.com", password: "Demo2026!" });
    const response = (await authorize(request("login", post(credentials)), "demo-login", demoEnv, now))!;
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    expect((await authorize(request("session", { headers: { cookie } }), "demo-login", demoEnv, now))!.status).toBe(200);
    const disabled = { ...demoEnv, DEMO_LOGIN_ENABLED: "false" };
    expect((await authorize(request("session", { headers: { cookie } }), "demo-login", disabled, now))!.status).toBe(401);
    expect((await authorize(request("login", post(credentials)), "demo-disabled", disabled, now))!.status).toBe(401);
  });

  test("configured account checks password and revokes sessions when changed", async () => {
    const salt = "12".repeat(16);
    const passwordHash = `${salt}:${scryptSync("strong-password", Buffer.from(salt, "hex"), 64).toString("hex")}`;
    const accountEnv = { ...env, LOGIN_EMAIL: "user@example.com", LOGIN_PASSWORD_SCRYPT: passwordHash };
    const body = (password: string) => JSON.stringify({ email: "USER@example.com", password });
    expect((await authorize(request("login", post(body("wrong"))), "account", accountEnv, now))!.status).toBe(401);
    const response = (await authorize(request("login", post(body("strong-password"))), "account", accountEnv, now))!;
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    expect((await authorize(request("session", { headers: { cookie } }), "account", accountEnv, now))!.status).toBe(200);
    expect((await authorize(request("session", { headers: { cookie } }), "account", { ...accountEnv, LOGIN_PASSWORD_SCRYPT: "" }, now))!.status).toBe(401);
  });
});

describe("Invitation authentication", () => {
  test("shared codes are reusable, normalized, and produce independent secure sessions", async () => {
    const first = await login(
      "reuse",
      JSON.stringify({ code: ` ${code.toLowerCase().replaceAll("-", " ")} ` }),
    );
    const second = await login("reuse");
    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(first.cookie).not.toBe(second.cookie);
    const header = first.response.headers.get("set-cookie")!;
    for (const flag of [
      "HttpOnly",
      "SameSite=Strict",
      "Secure",
      "Path=/",
      "Max-Age=28800",
    ])
      expect(header).toContain(flag);
    expect(header).not.toContain(code);
    expect(first.response.headers.get("cache-control")).toBe("no-store");
    const session = (await authorize(
      request("session", { headers: { cookie: first.cookie } }),
      "reuse",
      env,
      now + 1000,
    ))!;
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({
      expiresAt: now + SESSION_SECONDS * 1000,
    });
  });

  test("missing, forged, expired, and revoked sessions cannot enter", async () => {
    const { cookie } = await login("validation");
    for (const value of ["", "manta_session=garbage", cookie + "forged"]) {
      expect(
        (await authorize(
          request("session", { headers: { cookie: value } }),
          "validation",
          env,
          now,
        ))!.status,
      ).toBe(401);
    }
    expect(
      (await authorize(
        request("session", { headers: { cookie } }),
        "validation",
        env,
        now + SESSION_SECONDS * 1000,
      ))!.status,
    ).toBe(401);
    expect(
      (await authorize(
        request("session", { headers: { cookie } }),
        "validation",
        { ...env, INVITE_CODE_HASHES: "0".repeat(64) },
        now,
      ))!.status,
    ).toBe(401);
    expect(
      (await authorize(
        request("session", { headers: { cookie } }),
        "validation",
        { ...env, INVITE_SESSION_SECRET: "cd".repeat(32) },
        now,
      ))!.status,
    ).toBe(401);
  });

  test("rejects cross-origin writes, missing Origin, wrong methods and non-JSON", async () => {
    for (const path of ["login", "logout"]) {
      expect(
        (await authorize(
          request(path, post(undefined, "https://evil.example")),
          "csrf",
          env,
          now,
        ))!.status,
      ).toBe(403);
      expect(
        (await authorize(request(path, { method: "POST" }), "csrf", env, now))!
          .status,
      ).toBe(403);
      expect((await authorize(request(path), "csrf", env, now))!.status).toBe(
        405,
      );
      expect(
        (await authorize(
          request(path, {
            method: "POST",
            headers: { origin: env.INVITE_APP_ORIGIN },
          }),
          "csrf",
          env,
          now,
        ))!.status,
      ).toBe(415);
    }
  });

  test("validates untrusted JSON, code format, code value, and request size", async () => {
    for (const [body, status] of [
      ["{", 400],
      ["null", 401],
      ['{"code":123}', 401],
      ['{"code":"MC-FFFFF-FFFFF-FFFFF-FFFFF"}', 401],
      [" ".repeat(4097), 413],
    ] as const) {
      const response = await authorize(
        request("login", post(body)),
        `body-${status}-${body.length}`,
        env,
        now,
      );
      expect(response!.status).toBe(status);
    }
  });

  test("throttles attempts and recovers after the window, independently per IP", async () => {
    for (let i = 0; i < 5; i++)
      expect(
        (await authorize(
          request("login", post('{"code":"bad"}')),
          "limit",
          env,
          now,
        ))!.status,
      ).toBe(401);
    const limited = (await authorize(
      request("login", post()),
      "limit",
      env,
      now,
    ))!;
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(
      (await authorize(request("login", post()), "different-ip", env, now))!
        .status,
    ).toBe(200);
    expect(
      (await authorize(request("login", post()), "limit", env, now + 60_001))!
        .status,
    ).toBe(200);
  });

  test("fails closed on absent/unsafe configuration and clears the browser cookie on logout", async () => {
    for (const config of [
      {},
      { ...env, INVITE_SESSION_SECRET: "short" },
      { ...env, INVITE_APP_ORIGIN: "http://manta.example" },
      { ...env, INVITE_APP_ORIGIN: "ftp://localhost" },
    ]) {
      expect(
        (await authorize(request("session"), "config", config, now))!.status,
      ).toBe(503);
    }
    const response = (await authorize(
      request("logout", post("{}")),
      "logout",
      env,
      now,
    ))!;
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("manta_session=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("Local loopback Origin and DELETE gate (BUG-1/BUG-2)", () => {
  const localEnv = { ...env, INVITE_APP_ORIGIN: "http://localhost:5173" };
  const localRequest = (path: string, options: RequestInit) =>
    new Request(`http://localhost:5173/api/auth/${path}`, options);
  const localPost = (origin: string): RequestInit => ({
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  let counter = 0;
  const nextIp = () => `loopback-${++counter}`;

  test("accepts localhost and 127.0.0.1 with the same port", async () => {
    for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
      const response = (await authorize(
        localRequest("login", localPost(origin)),
        nextIp(),
        localEnv,
        now,
      ))!;
      expect(response.status).toBe(200);
    }
  });

  test("rejects a different port, host, or protocol with 403", async () => {
    for (const origin of [
      "http://localhost:5174",
      "http://127.0.0.1:5174",
      "http://evil.example:5173",
      "https://localhost:5173",
    ]) {
      const response = (await authorize(
        localRequest("login", localPost(origin)),
        nextIp(),
        localEnv,
        now,
      ))!;
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Origen no permitido." });
    }
  });

  test("applies the same-port alias when the configured origin is 127.0.0.1", async () => {
    const configured = { ...env, INVITE_APP_ORIGIN: "http://127.0.0.1:4173" };
    const response = (await authorize(
      new Request("http://127.0.0.1:4173/api/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:4173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      }),
      nextIp(),
      configured,
      now,
    ))!;
    expect(response.status).toBe(200);
  });

  test("keeps exact origin matching for HTTPS deployments", async () => {
    const response = (await authorize(
      request("login", localPost("http://127.0.0.1:5173")),
      nextIp(),
      env,
      now,
    ))!;
    expect(response.status).toBe(403);
  });

  test("lets DELETE pass with Origin and no JSON content type", async () => {
    const { cookie } = await login(nextIp());
    const del = new Request("https://manta.example/api/committee/jobs/job-1", {
      method: "DELETE",
      headers: { origin: env.INVITE_APP_ORIGIN, cookie },
    });
    expect(await authorize(del, nextIp(), env, now)).toBeNull();
    const foreign = (await authorize(
      new Request("https://manta.example/api/committee/jobs/job-1", {
        method: "DELETE",
        headers: { origin: "https://evil.example", cookie },
      }),
      nextIp(),
      env,
      now,
    ))!;
    expect(foreign.status).toBe(403);
  });

  test("advertises GET, POST, DELETE and keeps auth routes POST-only", async () => {
    const { cookie } = await login(nextIp());
    const put = (await authorize(
      new Request("https://manta.example/api/committee/jobs", {
        method: "PUT",
        headers: {
          origin: env.INVITE_APP_ORIGIN,
          "Content-Type": "application/json",
          cookie,
        },
        body: "{}",
      }),
      nextIp(),
      env,
      now,
    ))!;
    expect(put.status).toBe(405);
    expect(put.headers.get("allow")).toBe("GET, POST, DELETE");
    const loginDelete = (await authorize(
      request("login", {
        method: "DELETE",
        headers: { origin: env.INVITE_APP_ORIGIN },
      }),
      nextIp(),
      env,
      now,
    ))!;
    expect(loginDelete.status).toBe(405);
    expect(loginDelete.headers.get("allow")).toBe("POST");
  });
});

describe("ownerHash helper", () => {
  test("derives distinct ownerHash for different nonces with the same codeHash", async () => {
    const first = await login("owner-user-1");
    const second = await login("owner-user-2");

    const owner1 = ownerHash(first.cookie, env, now + 1000);
    const owner2 = ownerHash(second.cookie, env, now + 1000);

    expect(typeof owner1).toBe("string");
    expect(typeof owner2).toBe("string");
    expect(owner1).toMatch(/^[a-f0-9]{64}$/);
    expect(owner2).toMatch(/^[a-f0-9]{64}$/);
    expect(owner1).not.toBe(owner2);

    // Calling again returns identical deterministic ownerHash
    expect(ownerHash(first.cookie, env, now + 1000)).toBe(owner1);

    // Works when passing a Request object containing the cookie
    const req1 = new Request("https://manta.example/api/committee/jobs", {
      headers: { cookie: first.cookie },
    });
    const req2 = new Request("https://manta.example/api/committee/jobs", {
      headers: { cookie: second.cookie },
    });
    expect(ownerHash(req1, env, now + 1000)).toBe(owner1);
    expect(ownerHash(req2, env, now + 1000)).toBe(owner2);

    // Also works when passing just the raw token string
    const rawToken1 = first.cookie.replace("manta_session=", "");
    expect(ownerHash(rawToken1, env, now + 1000)).toBe(owner1);
  });

  test("invalid, forged, expired, or tampered cookie does not derive an owner", async () => {
    const { cookie } = await login("owner-validation");

    // Missing, empty, or garbage cookie
    expect(ownerHash("", env, now)).toBeNull();
    expect(ownerHash("manta_session=", env, now)).toBeNull();
    expect(ownerHash("manta_session=garbage", env, now)).toBeNull();
    expect(
      ownerHash(
        new Request("https://manta.example/api/committee/jobs"),
        env,
        now,
      ),
    ).toBeNull();

    // Forged signature
    expect(ownerHash(`${cookie}forged`, env, now)).toBeNull();

    // Expired cookie
    expect(ownerHash(cookie, env, now + SESSION_SECONDS * 1000)).toBeNull();

    // Expiry too far in future
    const token = cookie.replace("manta_session=", "");
    const parts = token.split(".");
    const futureExpiryToken = `${parts[0]}.${now + (SESSION_SECONDS + 100) * 1000}.${parts[2]}.${parts[3]}`;
    expect(ownerHash(`manta_session=${futureExpiryToken}`, env, now)).toBeNull();

    // Tampered nonce: split cookie, change nonce, keep old signature
    const tamperedNonceToken = `${parts[0]}.${parts[1]}.${"0".repeat(32)}.${parts[3]}`;
    expect(
      ownerHash(`manta_session=${tamperedNonceToken}`, env, now),
    ).toBeNull();

    // Secret mismatch
    expect(
      ownerHash(cookie, { ...env, INVITE_SESSION_SECRET: "cd".repeat(32) }, now),
    ).toBeNull();

    // Code hash mismatch
    expect(
      ownerHash(cookie, { ...env, INVITE_CODE_HASHES: "0".repeat(64) }, now),
    ).toBeNull();

    // Absent / unsafe configuration
    expect(ownerHash(cookie, {}, now)).toBeNull();
    expect(
      ownerHash(cookie, { ...env, INVITE_SESSION_SECRET: "short" }, now),
    ).toBeNull();
  });
});
