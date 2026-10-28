import { describe, expect, test } from "bun:test";
import { scryptSync } from "node:crypto";
import { authorize, hashInvitation, SESSION_SECONDS } from "../auth";

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
