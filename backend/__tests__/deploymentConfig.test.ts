import { expect, test } from "bun:test";
import { validateDeploymentEnvironment } from "../../scripts/validate-deploy-env";

test("deployment fails closed on absent secrets or an unsafe production origin", () => {
  const valid = { AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", INVITE_CODE_HASHES: "ab".repeat(32), INVITE_SESSION_SECRET: "cd".repeat(32), INVITE_APP_ORIGIN: "https://demo.cloudfront.net" };
  expect(() => validateDeploymentEnvironment(valid)).not.toThrow();
  for (const key of Object.keys(valid)) expect(() => validateDeploymentEnvironment({ ...valid, [key]: "" })).toThrow(key);
  for (const origin of ["http://localhost:5173", "https://demo.cloudfront.net/", "https://demo.cloudfront.net/path", "https://user:password@demo.cloudfront.net"]) {
    expect(() => validateDeploymentEnvironment({ ...valid, INVITE_APP_ORIGIN: origin })).toThrow();
  }
});
