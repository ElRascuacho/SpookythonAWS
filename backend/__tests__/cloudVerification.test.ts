import { expect, test } from "bun:test";
import { verifyCloud } from "../../scripts/verify-cloud";
import { handler } from "../handler";
import { hashInvitation } from "../auth";

function harness(options: { failLogin?: boolean; missingSecure?: boolean; nondeterministic?: boolean } = {}) {
  let simulations = 0;
  const calls: RequestInit[] = [];
  const fetchFn = async (input: string, init?: RequestInit) => {
    calls.push(init ?? {});
    if (input.endsWith("/api/auth/login")) return Response.json({ ok: true }, { status: options.failLogin ? 403 : 200, headers: { "set-cookie": `manta_session=private; Path=/; HttpOnly; SameSite=Strict${options.missingSecure ? "" : "; Secure"}` } });
    if (input.endsWith("/api/auth/session")) return Response.json({ expiresAt: Date.now() + 10000 });
    if (input.endsWith("/api/auth/logout")) return Response.json({ ok: true }, { headers: { "set-cookie": "manta_session=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0" } });
    if (!new Headers(init?.headers).has("cookie")) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (input.endsWith("/mayor-report")) return Response.json({ ok: true, report: { title: "Informe", executiveSummary: "Contagios evitados", auditMetrics: {} } });
    simulations++;
    return Response.json({ ok: true, result: { params: { seed: 20261030, days: 10, monteCarloRuns: 10 }, strategies: { SMART_CORTAFUEGOS: { zeroWastedVaccinesVerified: true, meanTotalInfected: options.nondeterministic ? simulations : 100 }, RANDOM: { meanTotalInfected: 200 }, NO_INTERVENTION: { meanTotalInfected: 300 } } } });
  };
  return { fetchFn, calls };
}

test("cloud verification asserts authenticated deterministic flow using the configured origin", async () => {
  const { fetchFn, calls } = harness();
  const result = await verifyCloud({ endpoint: "https://demo.cloudfront.net", appOrigin: "https://demo.cloudfront.net", code: "test", fetchFn });
  expect(result.deterministic).toBe(true);
  expect(calls.filter(call => call.method === "POST").every(call => new Headers(call.headers).get("origin") === "https://demo.cloudfront.net")).toBe(true);
});

test("cloud verification fails on authentication, cookie security or nondeterminism", async () => {
  for (const options of [{ failLogin: true }, { missingSecure: true }, { nondeterministic: true }]) {
    await expect(verifyCloud({ endpoint: "https://demo.cloudfront.net", appOrigin: "https://demo.cloudfront.net", code: "test", fetchFn: harness(options).fetchFn })).rejects.toThrow();
  }
});

test("cloud probe exercises the real Lambda adapter locally without network or AWS", async () => {
  const code = "MC-01234-56789-ABCDE-F0123";
  const config = { INVITE_CODE_HASHES: hashInvitation(code), INVITE_SESSION_SECRET: "ef".repeat(32), INVITE_APP_ORIGIN: "https://integration.example", AWS_LAMBDA_FUNCTION_NAME: "local-probe" };
  const before = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  try {
    const fetchFn = async (url: string, init?: RequestInit) => {
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const result = await handler({ rawPath: new URL(url).pathname, headers, body: typeof init?.body === "string" ? init.body : undefined, requestContext: { http: { method: init?.method, sourceIp: "local-cloud-probe" } } });
      return new Response(result.body, { status: result.statusCode, headers: { ...result.headers, ...(result.cookies?.length ? { "set-cookie": result.cookies.join(", ") } : {}) } });
    };
    expect((await verifyCloud({ endpoint: config.INVITE_APP_ORIGIN, appOrigin: config.INVITE_APP_ORIGIN, code, fetchFn })).deterministic).toBe(true);
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
