import { expect, test } from "bun:test";
import { createGame } from "../cureGame";
import { runMonteCarloComparison } from "../monteCarlo";
import { TOTAL_MANTA_POPULATION } from "../mantaGraph";

// Runs every matrix case twice to verify invariants, not execution latency.
test("jury matrix preserves determinism and valid invariants without assuming a universal winner", () => {
  const rows: object[] = [];
  for (const seed of [0, 42, 20261030]) {
    for (const condition of ["standard", "surprise", "escape", "half-vaccines"] as const) {
      const game = createGame({ seed, scenario: condition === "half-vaccines" ? "standard" : condition, patientZeroId: "N01", dailyBudget: 7500, vaccineBatchSize: condition === "half-vaccines" ? 425 : 850 });
      const params = { ...game.params, days: 30, monteCarloRuns: 20 };
      const result = runMonteCarloComparison(params);
      const repeat = runMonteCarloComparison(params);
      expect(result.strategies).toEqual(repeat.strategies);
      for (const summary of Object.values(result.strategies)) {
        expect(Number.isFinite(summary.meanTotalInfected)).toBe(true);
        expect(summary.p10TotalInfected).toBeLessThanOrEqual(summary.p90TotalInfected);
        expect(summary.zeroWastedVaccinesVerified).toBe(true);
        for (const day of summary.representativeRun.timeline) {
          expect(day.totalS + day.totalE + day.totalI + day.totalR).toBe(TOTAL_MANTA_POPULATION);
          expect(day.action.budgetSpent).toBeLessThanOrEqual(params.dailyBudget);
          expect(day.action.budgetSpent).toBeGreaterThanOrEqual(0);
        }
      }
      const smart = result.strategies.SMART_CORTAFUEGOS.meanTotalInfected;
      const random = result.strategies.RANDOM.meanTotalInfected;
      const none = result.strategies.NO_INTERVENTION.meanTotalInfected;
      rows.push({ seed, condition, smart, random, none, smartBeatsBoth: smart < random && smart < none });
    }
  }
  console.log("Jury matrix (mean cumulative infections):", JSON.stringify(rows));
}, 90_000);
