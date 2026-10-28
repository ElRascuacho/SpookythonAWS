import { describe, expect, test } from "bun:test";
import {
  attemptPromotion,
  auditFinalRecommendation,
  createPromotionState,
  selectSearchIncumbent,
} from "../committee/promotion";
import {
  createDeterministicPools,
  createStreamRng,
  deriveStreamSeeds,
  getPromotionPool,
  getSelectionPool,
  validateDisjointPools,
} from "../committee/manifest";
import type { PolicyWeights } from "../committee/types";

const candidate: PolicyWeights = [0.5, 0, 0, 0];
const seeds = deriveStreamSeeds(42);
const repeated = (size: number, value: number) => Array.from({ length: size }, () => value);

describe("Committee progressive promotion", () => {
  test("selection and promotion use fresh, disjoint seeds on every round", () => {
    const pools = createDeterministicPools();
    const all = [pools.baseline, pools.train, pools.final];
    for (let round = 0; round < 8; round++) {
      all.push(getSelectionPool(pools, round), getPromotionPool(pools, round));
    }
    const indices = all.flatMap((pool) => pool.runIndices);
    expect(new Set(indices).size).toBe(indices.length);
    expect(() => validateDisjointPools(pools)).not.toThrow();
    expect(() => getPromotionPool(pools, 8)).toThrow();
    expect(() => getSelectionPool(pools, -1)).toThrow();
  });

  test("selection breaks equal means lexicographically without publishing", () => {
    const state = createPromotionState();
    const incumbent: PolicyWeights = [0.2, 0, 0, 0];
    const result = selectSearchIncumbent(candidate, incumbent, createDeterministicPools(), 0,
      (_champion, _incumbent, indices) => {
        expect(indices).toEqual(getSelectionPool(createDeterministicPools(), 0).runIndices);
        return { candidate: repeated(24, 10), incumbent: repeated(24, 10) };
      });
    expect(result).toEqual(incumbent);
    expect(state.publishedPolicyVersion).toBe(0);
  });

  test("freezes candidate before evaluation and publishes only strict supported improvement", () => {
    const pools = createDeterministicPools();
    const state = createPromotionState();
    let frozenDuringEvaluation = false;
    const result = attemptPromotion(state, candidate, pools,
      createStreamRng("bootstrap", seeds, 0), (weights, incumbent, indices) => {
        frozenDuringEvaluation = Object.isFrozen(weights) && weights !== candidate;
        expect(incumbent).toEqual([0, 0, 0, 0]);
        expect(indices).toHaveLength(64);
        return { candidate: repeated(64, 5), incumbent: repeated(64, 10) };
      });
    expect(frozenDuringEvaluation).toBe(true);
    expect(result.promoted).toBe(true);
    expect(result.state.publishedPolicyVersion).toBe(1);
    expect(result.state.stateRevision).toBe(2);
    expect(result.state.progressVersions).toHaveLength(1);
    expect(result.state.progressVersions[0].weights).toEqual(candidate);
  });

  test("tie and insufficient evidence preserve the published incumbent", () => {
    const pools = createDeterministicPools();
    const state = createPromotionState();
    const tied = attemptPromotion(state, candidate, pools,
      createStreamRng("bootstrap", seeds, 0), () => ({
        candidate: repeated(64, 10), incumbent: repeated(64, 10),
      }));
    expect(tied.promoted).toBe(false);
    expect(tied.state.publishedPolicyVersion).toBe(0);
    expect(tied.state.promotionAttempts).toBe(1);
    expect(tied.state.stateRevision).toBe(state.stateRevision + 1);
    const noisy = attemptPromotion(tied.state, candidate, pools,
      createStreamRng("bootstrap", seeds, 1), () => ({
        candidate: [...repeated(33, 0), ...repeated(31, 20)],
        incumbent: repeated(64, 10),
      }));
    expect(noisy.meanDifference).toBeLessThan(0);
    expect(noisy.upperBound).toBeGreaterThanOrEqual(0);
    expect(noisy.promoted).toBe(false);
    expect(noisy.state.publishedPolicyVersion).toBe(0);
    expect(noisy.state.promotionAttempts).toBe(2);
    expect(noisy.state.stateRevision).toBe(state.stateRevision + 2);
  });

  test("Bonferroni gate rejects a gain that a plain 95% bound would accept", () => {
    const pools = createDeterministicPools();
    const result = attemptPromotion(createPromotionState(), candidate, pools,
      createStreamRng("bootstrap", seeds, 5), () => ({
        candidate: [...repeated(63, 9), 30],
        incumbent: repeated(64, 10),
      }));
    expect(result.meanDifference).toBeLessThan(0);
    expect(result.upperBound).toBeGreaterThanOrEqual(0);
    expect(result.promoted).toBe(false);
  });

  test("promotion stops after eight attempts without evaluating a ninth pool", () => {
    const exhausted = { ...createPromotionState(), promotionAttempts: 8 };
    let evaluated = false;
    expect(() => attemptPromotion(exhausted, candidate, createDeterministicPools(),
      createStreamRng("bootstrap", seeds, 8), () => {
        evaluated = true;
        return { candidate: repeated(64, 5), incumbent: repeated(64, 10) };
      })).toThrow("Pool round");
    expect(evaluated).toBe(false);
  });

  test("final audit can revert recommendation to SGC while revision grows", () => {
    const pools = createDeterministicPools();
    const promoted = attemptPromotion(createPromotionState(), candidate, pools,
      createStreamRng("bootstrap", seeds, 0), () => ({
        candidate: repeated(64, 5), incumbent: repeated(64, 10),
      })).state;
    const final = auditFinalRecommendation(promoted, pools.final,
      createStreamRng("bootstrap", seeds, 100), () => ({
        candidate: repeated(128, 12), sgc: repeated(128, 10),
        random: repeated(128, 15), none: repeated(128, 20),
      }));
    expect(final.finalAudit).toBe("failed");
    expect(final.recommendedPolicyVersion).toBe(0);
    expect(final.publishedPolicyVersion).toBe(1);
    expect(final.progressVersions).toHaveLength(1);
    expect(final.stateRevision).toBe(promoted.stateRevision + 1);
    expect(() => auditFinalRecommendation(final, pools.final,
      createStreamRng("bootstrap", seeds, 102), () => ({
        candidate: repeated(128, 5), sgc: repeated(128, 10),
        random: repeated(128, 15), none: repeated(128, 20),
      }))).toThrow("only once");
  });

  test("favorable final audit keeps learned recommendation", () => {
    const pools = createDeterministicPools();
    const promoted = attemptPromotion(createPromotionState(), candidate, pools,
      createStreamRng("bootstrap", seeds, 0), () => ({
        candidate: repeated(64, 5), incumbent: repeated(64, 10),
      })).state;
    const final = auditFinalRecommendation(promoted, pools.final,
      createStreamRng("bootstrap", seeds, 101), () => ({
        candidate: repeated(128, 5), sgc: repeated(128, 10),
        random: repeated(128, 15), none: repeated(128, 20),
      }));
    expect(final.finalAudit).toBe("passed");
    expect(final.recommendedPolicyVersion).toBe(1);
    expect(final.stateRevision).toBe(promoted.stateRevision + 1);
  });
});
