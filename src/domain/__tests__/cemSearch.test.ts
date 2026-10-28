import { describe, expect, test } from "bun:test";
import {
  CEM_CONFIG,
  initialCemState,
  proposeGeneration,
  updateFromTrainElites,
} from "../committee/cemSearch";
import { createStreamRng, deriveStreamSeeds } from "../committee/manifest";
import { ZERO_POLICY_WEIGHTS, type PolicyWeights } from "../committee/types";

describe("CEM search uses the train pool only", () => {
  test("each generation has 24 candidates including SGC and the search incumbent", () => {
    const state = initialCemState();
    const rng = createStreamRng("search", deriveStreamSeeds(20261030), 0);
    const warm: PolicyWeights = [0.2, -0.2, 0.2, -0.2];
    const candidates = proposeGeneration(state, rng, [warm]);
    expect(candidates).toHaveLength(CEM_CONFIG.candidatesPerGeneration);
    expect(candidates[0]).toEqual([...ZERO_POLICY_WEIGHTS]);
    expect(candidates[1]).toEqual([...state.searchIncumbent]);
    expect(candidates[2]).toEqual([...warm]);
  });

  test("the search center moves from train elites and ignores any other score source", () => {
    const state = initialCemState();
    const elites: PolicyWeights[] = [
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
    ];
    const next = updateFromTrainElites(state, elites);
    expect(next.searchIncumbent).toEqual([1, 0, 0, 0]);
    expect(next.mean[0]).toBeCloseTo(0.7, 5);
    expect(next.sigma[0]).toBeCloseTo(0.3 * CEM_CONFIG.initialSigma, 5);
    expect(next.generation).toBe(1);
  });

  test("sigma does not fall below the floor", () => {
    const state = {
      ...initialCemState(),
      sigma: [0.15, 0.15, 0.15, 0.15] as PolicyWeights,
    };
    const elites = Array.from({ length: 6 }, () => [0, 0, 0, 0] as PolicyWeights);
    const next = updateFromTrainElites(state, elites);
    expect(next.sigma.every((value) => value >= CEM_CONFIG.sigmaFloor)).toBe(true);
  });
});
