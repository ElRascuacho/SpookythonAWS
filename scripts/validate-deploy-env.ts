/** Validate names and formats only: never print environment values. */
export function validateDeploymentEnvironment(env: Record<string, string | undefined>) {
  for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "INVITE_CODE_HASHES", "INVITE_SESSION_SECRET", "INVITE_APP_ORIGIN"]) {
    if (!env[key]?.trim()) throw new Error(`Missing required deployment secret: ${key}`);
  }
  if (!/^[a-f0-9]{64}(,[a-f0-9]{64})*$/.test(env.INVITE_CODE_HASHES!)) throw new Error("Invalid INVITE_CODE_HASHES format");
  if (!/^[a-f0-9]{64}$/.test(env.INVITE_SESSION_SECRET!)) throw new Error("Invalid INVITE_SESSION_SECRET format");
  let origin: URL;
  try { origin = new URL(env.INVITE_APP_ORIGIN!); } catch { throw new Error("Invalid INVITE_APP_ORIGIN format"); }
  if (origin.protocol !== "https:" || origin.origin !== env.INVITE_APP_ORIGIN) throw new Error("INVITE_APP_ORIGIN must be a canonical HTTPS origin");
}

if (import.meta.main) {
  try {
    validateDeploymentEnvironment(process.env);
    console.log("Deployment configuration validated.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid deployment configuration");
    process.exitCode = 1;
  }
}
