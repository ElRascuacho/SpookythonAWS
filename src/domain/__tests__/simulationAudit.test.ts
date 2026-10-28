import { describe, expect, test } from "bun:test";
import { DEFAULT_SIMULATION_PARAMS } from "../mantaGraph";
import { simulateSample } from "../multiSimulation";
import { dailyCumulativeBand, distribution, pairsToCsv, samplesToCsv } from "../simulationAudit";
import { runSingleSeirSimulation } from "../seirEngine";
import type { PolicyPair } from "../policyEvaluation";

describe("simulation audit", () => {
  test("keeps the engine totals needed to inspect one run", () => {
    const params = { ...DEFAULT_SIMULATION_PARAMS, days: 3, seed: 42 };
    const sample = simulateSample(params, "NO_INTERVENTION", 2, {});
    const run = runSingleSeirSimulation(params, "NO_INTERVENTION", 2);
    expect(sample.seed).toBe(42);
    expect(sample.index).toBe(2);
    expect(sample.peakDay).toBe(run.peakDay);
    expect(sample.vaccines).toBe(run.totalVaccinesUsed);
    expect(sample.hospitalCollapseDays).toBe(run.hospitalCollapseDays);
  });

  test("summarizes spread and the daily band from the same runs", () => {
    const stats = distribution([10, 30, 20]);
    expect(stats).toMatchObject({ min: 10, median: 20, max: 30, mean: 20 });
    const band = dailyCumulativeBand([[0, 10], [0, 30], [0, 20]]);
    expect(band[1]).toMatchObject({ day: 1, mean: 20, p10: 12, p90: 28 });
  });

  test("exports one csv row per run and per policy pair", () => {
    const sample = simulateSample({ ...DEFAULT_SIMULATION_PARAMS, days: 1, seed: 7 }, "RANDOM", 4, {});
    const csv = samplesToCsv({ plan: "Azar, local", difficulty: "normal", seed: 7 }, [sample]);
    expect(csv.split("\r\n")[0]).toContain("indice,contagios");
    expect(csv).toContain('"Azar, local",normal,7,4,');
    const pair: PolicyPair = {
      index: 3,
      candidate: { ...sample, infected: 12, hospitalCollapseDays: 2 },
      sgc: { ...sample, infected: 18, hospitalCollapseDays: 4 },
    };
    const paired = pairsToCsv({ plan: "Comité", difficulty: "16 zonas", seed: 7, policyVersion: 1, registryVersion: 'v"1' }, [pair]);
    expect(paired).toContain('Comité,16 zonas,7,1,"v""1",3,12,18,6,');
  });
});
