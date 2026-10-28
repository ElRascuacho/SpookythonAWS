import type { RngFunction } from "../prng";
import { getPromotionPool, getSelectionPool } from "./manifest";
import {
  POOL_SIZES,
  WEIGHT_BOUNDS,
  ZERO_POLICY_WEIGHTS,
  type PolicyWeights,
  type SeedPool,
  type SeedPools,
} from "./types";

export const PROMOTION_ATTEMPTS = 8;
export const BOOTSTRAP_RESAMPLES = 2000;
export const PROMOTION_ALPHA = 0.05 / PROMOTION_ATTEMPTS;
export const FINAL_AUDIT_ALPHA = 0.05;

export interface PairedScores {
  readonly candidate: readonly number[];
  readonly incumbent: readonly number[];
}

export interface FinalScores {
  readonly candidate: readonly number[];
  readonly sgc: readonly number[];
  readonly random: readonly number[];
  readonly none: readonly number[];
}

export interface PromotionEvidence {
  readonly meanDifference: number;
  readonly upperBound: number;
}

export interface ProgressVersion extends PromotionEvidence {
  readonly version: number;
  readonly weights: PolicyWeights;
}

export interface PromotionState {
  readonly publishedPolicyVersion: number;
  readonly publishedWeights: PolicyWeights;
  readonly recommendedPolicyVersion: number;
  readonly promotionAttempts: number;
  readonly stateRevision: number;
  readonly progressVersions: readonly ProgressVersion[];
  readonly finalAudit: "not-run" | "passed" | "failed";
  readonly finalEvidence?: PromotionEvidence;
}

export function createPromotionState(): PromotionState {
  return Object.freeze({
    publishedPolicyVersion: 0,
    publishedWeights: Object.freeze([...ZERO_POLICY_WEIGHTS]) as unknown as PolicyWeights,
    recommendedPolicyVersion: 0,
    promotionAttempts: 0,
    stateRevision: 1,
    progressVersions: Object.freeze([]) as readonly ProgressVersion[],
    finalAudit: "not-run" as const,
  });
}

function freezeWeights(weights: PolicyWeights): PolicyWeights {
  if (weights.length !== 4 || weights.some((value) =>
    !Number.isFinite(value) || value < WEIGHT_BOUNDS.min || value > WEIGHT_BOUNDS.max)) {
    throw new RangeError("Candidate must have four finite weights in [-3, 3]");
  }
  return Object.freeze([...weights]) as unknown as PolicyWeights;
}

function validateScores(scores: readonly number[], expected: number): void {
  if (scores.length !== expected || scores.some((value) => !Number.isFinite(value))) {
    throw new RangeError(`Expected ${expected} finite paired scores`);
  }
}

function pairedEvidence(
  candidate: readonly number[],
  incumbent: readonly number[],
  expected: number,
  alpha: number,
  rng: RngFunction,
): PromotionEvidence {
  validateScores(candidate, expected);
  validateScores(incumbent, expected);
  const differences = candidate.map((score, i) => score - incumbent[i]);
  const meanDifference = differences.reduce((sum, value) => sum + value, 0) / expected;
  const bootstrapMeans = new Array<number>(BOOTSTRAP_RESAMPLES);
  for (let sample = 0; sample < BOOTSTRAP_RESAMPLES; sample++) {
    let sum = 0;
    for (let i = 0; i < expected; i++) {
      const index = Math.min(expected - 1, Math.floor(rng() * expected));
      sum += differences[index];
    }
    bootstrapMeans[sample] = sum / expected;
  }
  bootstrapMeans.sort((a, b) => a - b);
  const upperIndex = Math.ceil((1 - alpha) * BOOTSTRAP_RESAMPLES) - 1;
  return { meanDifference, upperBound: bootstrapMeans[upperIndex] };
}

function serializeWeights(weights: PolicyWeights): string {
  return JSON.stringify(weights);
}

/** Train search may use selection for ranking, never for CEM moment updates. */
export function selectSearchIncumbent(
  champion: PolicyWeights,
  incumbent: PolicyWeights,
  pools: SeedPools,
  generation: number,
  evaluate: (champion: PolicyWeights, incumbent: PolicyWeights, runIndices: readonly number[]) => PairedScores,
): PolicyWeights {
  const frozenChampion = freezeWeights(champion);
  const frozenIncumbent = freezeWeights(incumbent);
  const pool = getSelectionPool(pools, generation);
  const scores = evaluate(frozenChampion, frozenIncumbent, pool.runIndices);
  const championScores = scores.candidate;
  const incumbentScores = scores.incumbent;
  validateScores(championScores, POOL_SIZES.selection);
  validateScores(incumbentScores, POOL_SIZES.selection);
  const championMean = championScores.reduce((sum, value) => sum + value, 0) / championScores.length;
  const incumbentMean = incumbentScores.reduce((sum, value) => sum + value, 0) / incumbentScores.length;
  if (championMean < incumbentMean) return frozenChampion;
  if (championMean > incumbentMean) return frozenIncumbent;
  return serializeWeights(frozenChampion) < serializeWeights(frozenIncumbent) ? frozenChampion : frozenIncumbent;
}

/** Candidate is copied and frozen before the evaluator can use the promotion pool. */
export function attemptPromotion(
  state: PromotionState,
  candidate: PolicyWeights,
  pools: SeedPools,
  bootstrapRng: RngFunction,
  evaluate: (candidate: PolicyWeights, incumbent: PolicyWeights, runIndices: readonly number[]) => PairedScores,
): { readonly state: PromotionState; readonly promoted: boolean; readonly meanDifference: number; readonly upperBound: number } {
  if (state.finalAudit !== "not-run") throw new Error("Cannot promote after final audit");
  const frozenCandidate = freezeWeights(candidate);
  const pool = getPromotionPool(pools, state.promotionAttempts);
  const scores = evaluate(frozenCandidate, state.publishedWeights, pool.runIndices);
  const evidence = pairedEvidence(scores.candidate, scores.incumbent, pool.size, PROMOTION_ALPHA, bootstrapRng);
  const promoted = evidence.meanDifference < 0 && evidence.upperBound < 0;
  if (!promoted) {
    return {
      state: Object.freeze({
        ...state,
        promotionAttempts: state.promotionAttempts + 1,
        stateRevision: state.stateRevision + 1,
      }),
      promoted,
      ...evidence,
    };
  }
  const version = state.publishedPolicyVersion + 1;
  const progress = Object.freeze({ version, weights: frozenCandidate, ...evidence });
  return {
    state: Object.freeze({
      ...state,
      publishedPolicyVersion: version,
      publishedWeights: frozenCandidate,
      recommendedPolicyVersion: version,
      promotionAttempts: state.promotionAttempts + 1,
      stateRevision: state.stateRevision + 1,
      progressVersions: Object.freeze([...state.progressVersions, progress]),
    }),
    promoted,
    ...evidence,
  };
}

/** Final evidence never rewrites or deletes earlier progressive versions. */
export function auditFinalRecommendation(
  state: PromotionState,
  finalPool: SeedPool,
  bootstrapRng: RngFunction,
  evaluate: (candidate: PolicyWeights, runIndices: readonly number[]) => FinalScores,
): PromotionState {
  if (state.finalAudit !== "not-run") throw new Error("Final audit may run only once");
  if (finalPool.size !== POOL_SIZES.final) throw new RangeError("Invalid final audit pool");
  const scores = evaluate(state.publishedWeights, finalPool.runIndices);
  validateScores(scores.random, finalPool.size);
  validateScores(scores.none, finalPool.size);
  const evidence = pairedEvidence(scores.candidate, scores.sgc, finalPool.size, FINAL_AUDIT_ALPHA, bootstrapRng);
  const passed = state.publishedPolicyVersion > 0 && evidence.meanDifference < 0 && evidence.upperBound < 0;
  return Object.freeze({
    ...state,
    recommendedPolicyVersion: passed ? state.publishedPolicyVersion : 0,
    stateRevision: state.stateRevision + 1,
    finalAudit: passed ? "passed" : "failed",
    finalEvidence: Object.freeze(evidence),
  });
}
