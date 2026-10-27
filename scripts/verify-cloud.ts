import { strict as assert } from "node:assert";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
interface VerificationOptions {
  endpoint: string;
  appOrigin: string;
  code: string;
  fetchFn?: FetchFn;
}

/** Opt-in live probe; importing this module never makes network requests. */
export async function verifyCloud({ endpoint, appOrigin, code, fetchFn = fetch }: VerificationOptions) {
  const base = new URL(endpoint);
  assert(base.protocol === "https:" && !base.username && !base.password, "Endpoint must use HTTPS without credentials");
  const origin = new URL(appOrigin);
  assert(origin.protocol === "https:" && origin.origin === appOrigin, "App origin must be a canonical HTTPS origin");
  assert(code.trim(), "An invitation code is required");
  const root = endpoint.replace(/\/$/, "");
  let cookie = "";
  const request = (path: string, body?: object, authenticated = true) => fetchFn(`${root}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Origin: appOrigin, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(authenticated && cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = { seed: 20261030, days: 10, monteCarloRuns: 10 };
  const unauth = await request("/simulate", payload, false);
  await unauth.text();
  assert.equal(unauth.status, 401, "Unauthenticated simulation must return 401");
  const login = await request("/api/auth/login", { code }, false);
  await login.text();
  assert.equal(login.status, 200, "Invitation login failed");
  const header = login.headers.get("set-cookie") ?? "";
  for (const flag of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/"]) assert(header.split(/;\s*/).includes(flag), `Missing cookie flag: ${flag}`);
  cookie = header.split(";")[0];
  assert(cookie.startsWith("manta_session="), "Missing session cookie");
  try {
    const session = await request("/api/auth/session");
    const sessionData = await session.json();
    assert.equal(session.status, 200, "Session validation failed");
    assert(Number.isFinite(sessionData.expiresAt) && sessionData.expiresAt > Date.now(), "Session expiry is invalid");
    const simulate = async () => {
      const response = await request("/simulate", payload);
      const data = await response.json();
      assert.equal(response.status, 200, "Simulation failed");
      assert.equal(data.ok, true);
      assert.equal(data.result?.params?.seed, payload.seed);
      assert.equal(data.result?.params?.days, payload.days);
      assert.equal(data.result?.params?.monteCarloRuns, payload.monteCarloRuns);
      for (const strategy of ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"]) assert(Number.isFinite(data.result?.strategies?.[strategy]?.meanTotalInfected), `Invalid ${strategy} result`);
      assert.equal(data.result.strategies.SMART_CORTAFUEGOS.zeroWastedVaccinesVerified, true);
      return data.result;
    };
    const first = await simulate();
    const second = await simulate();
    assert.deepEqual(first.params, second.params, "Simulation configuration changed");
    assert.deepEqual(first.strategies, second.strategies, "Simulation is not deterministic");
    const report = await request("/mayor-report", payload);
    const reportData = await report.json();
    assert.equal(report.status, 200, "Executive report failed");
    assert.equal(reportData.ok, true);
    assert.equal(typeof reportData.report?.executiveSummary, "string");
    assert(reportData.report.executiveSummary.length > 0, "Executive report is empty");
    return { deterministic: true, strategies: first.strategies };
  } finally {
    const logout = await request("/api/auth/logout", {});
    await logout.text();
    assert.equal(logout.status, 200, "Logout failed");
    assert((logout.headers.get("set-cookie") ?? "").includes("Max-Age=0"), "Logout did not clear cookie");
  }
}

if (import.meta.main) {
  try {
    const endpoint = process.env.VERIFY_ENDPOINT ?? "";
    const appOrigin = process.env.INVITE_APP_ORIGIN ?? "";
    const code = (await Bun.file(".invite-code.local").text()).trim();
    await verifyCloud({ endpoint, appOrigin, code });
    console.log("Cloud verification passed: authentication, secure cookies, deterministic simulations and executive report.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Cloud verification failed");
    process.exitCode = 1;
  }
}
