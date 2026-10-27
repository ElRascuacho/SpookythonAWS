import { expect, test } from "bun:test";
import { advanceDay, createGame } from "../cureGame";
import { PartialSimulationParamsSchema } from "../schemas/simulationParams.schema";
import { authorize, hashInvitation } from "../../../backend/auth";
import { buildMayorExecutiveBriefing } from "../../../backend/handler";
import { runMonteCarloComparison } from "../monteCarlo";

const config = { seed: 20261030, scenario: "standard" as const, patientZeroId: "N01", dailyBudget: 7500 };

test("jury vaccine quantity preserves defaults and halves doses without halving cost", () => {
  expect(createGame(config).params.vaccineBatchSize).toBe(850);
  const game = createGame({ ...config, vaccineBatchSize: 425 });
  expect(game.params.vaccineBatchSize).toBe(425);
  const next = advanceDay(game, [{ nodeId: "N01", kind: "vaccine" }], 0);
  expect(next.actions[1].vaccinatedNodes.N01).toBe(425);
  expect(next.actions[1].budgetSpent).toBe(2400);
  for (const vaccineBatchSize of [0, 9, 5001, 425.5, NaN]) {
    expect(() => createGame({ ...config, vaccineBatchSize })).toThrow();
  }
});

test("API accepts the active UI seed and budget boundaries", () => {
  expect(PartialSimulationParamsSchema.safeParse({ seed: 0, dailyBudget: 11000, vaccineBatchSize: 425 }).success).toBe(true);
});

test("auth rejects unrelated CloudFront origins and HTTP configuration in Lambda", async () => {
  const env = { INVITE_CODE_HASHES: hashInvitation("MC-01234-56789-ABCDE-F0123"), INVITE_SESSION_SECRET: "ab".repeat(32), INVITE_APP_ORIGIN: "https://manta.example" };
  const request = (origin: string) => new Request("https://api.internal/api/auth/logout", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
  for (const origin of ["https://other.cloudfront.net", "https://manta.example.evil.test", "null", "https://manta.example:444"]) {
    expect((await authorize(request(origin), "jury-origin", env))!.status).toBe(403);
  }
  const accepted = (await authorize(request(env.INVITE_APP_ORIGIN), "jury-origin", env))!;
  expect(accepted.status).toBe(200);
  expect(accepted.headers.get("set-cookie")).toContain("Secure");
  expect((await authorize(request("http://localhost:5173"), "jury-origin", { ...env, INVITE_APP_ORIGIN: "http://localhost:5173", AWS_LAMBDA_FUNCTION_NAME: "simulation" }))!.status).toBe(503);
});

test("executive report describes infections avoided, not mortality", () => {
  const result = runMonteCarloComparison({ days: 2, monteCarloRuns: 10 });
  const report = buildMayorExecutiveBriefing(result);
  expect(report.executiveSummary).toContain("contagios");
  expect(report.executiveSummary).not.toMatch(/salva.*vidas|colapso en el Hospital/i);
  expect(report.auditMetrics.livesSavedVsNoIntervention).toBe(result.strategies.SMART_CORTAFUEGOS.meanLivesSavedVsBaseline);
});
