import { describe, expect, test } from "bun:test";
import { DEFAULT_SIMULATION_PARAMS } from "../mantaGraph";
import { simulateSample } from "../multiSimulation";
import { createDifficultyGraph } from "../difficultyGraph";
import { runSingleSeirSimulation } from "../seirEngine";

describe("parallel simulation samples", () => {
  test("same seed, strategy and run index are reproducible regardless of order", () => {
    const params = { ...DEFAULT_SIMULATION_PARAMS, days: 3, seed: 42 };
    const first = simulateSample(params, "RANDOM", 1, {});
    simulateSample(params, "RANDOM", 0, {});
    expect(simulateSample(params, "RANDOM", 1, {})).toEqual(first);
    expect(first.daily).toHaveLength(4);
    expect(first.daily[3]).toBe(first.infected);
  });

  test("player plan uses recorded actions instead of automatically inventing actions", () => {
    const params = { ...DEFAULT_SIMULATION_PARAMS, days: 2 };
    const sample = simulateSample(params, "PLAYER", 0, {});
    expect(sample.spent).toBe(0);
  });
  test("subdivided difficulty scenarios preserve population and remain deterministic", () => {
    const base = { ...DEFAULT_SIMULATION_PARAMS, days: 3 };
    for (const difficulty of ["hard", "extreme"] as const) {
      const graph = createDifficultyGraph(difficulty);
      const params = { ...base, patientZeroIds: [graph.parentToChildren.N01[0]] };
      const run = runSingleSeirSimulation(params, "SMART_CORTAFUEGOS", 0, undefined, graph);
      for (const day of run.timeline) expect(day.totalS + day.totalE + day.totalI + day.totalR).toBe(graph.totalPopulation);
      expect(simulateSample(base, "RANDOM", 0, {}, difficulty)).toEqual(simulateSample(base, "RANDOM", 0, {}, difficulty));
      expect(() => simulateSample(base, "PLAYER", 0, {}, difficulty)).toThrow();
    }
  });
});
