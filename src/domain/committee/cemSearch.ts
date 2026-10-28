import type { RngFunction } from "../prng";
import { WEIGHT_BOUNDS, ZERO_POLICY_WEIGHTS, type PolicyWeights } from "./types";

export const CEM_CONFIG = {
  generations: 8,
  candidatesPerGeneration: 24,
  elites: 6,
  newMomentWeight: 0.7,
  initialSigma: 1.3,
  sigmaFloor: 0.15,
} as const;

export interface CemState {
  generation: number;
  mean: PolicyWeights;
  sigma: PolicyWeights;
  searchIncumbent: PolicyWeights;
}

function clampWeight(value: number): number {
  return Math.min(WEIGHT_BOUNDS.max, Math.max(WEIGHT_BOUNDS.min, value));
}

function asWeights(values: readonly number[]): PolicyWeights {
  return [
    clampWeight(values[0]),
    clampWeight(values[1]),
    clampWeight(values[2]),
    clampWeight(values[3]),
  ];
}

/** Standard normal sample. Consumes the search stream only. */
function gaussian(rng: RngFunction): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function initialCemState(): CemState {
  return {
    generation: 0,
    mean: [0, 0, 0, 0],
    sigma: [
      CEM_CONFIG.initialSigma,
      CEM_CONFIG.initialSigma,
      CEM_CONFIG.initialSigma,
      CEM_CONFIG.initialSigma,
    ],
    searchIncumbent: [...ZERO_POLICY_WEIGHTS],
  };
}

/**
 * 24 candidates: SGC, search incumbent, warm starts, then Gaussian mutations.
 * Warm starts occupy slots inside the 24; they do not add trajectories.
 */
export function proposeGeneration(
  state: CemState,
  searchRng: RngFunction,
  warmStarts: readonly PolicyWeights[] = [],
): PolicyWeights[] {
  const candidates: PolicyWeights[] = [
    [...ZERO_POLICY_WEIGHTS],
    [...state.searchIncumbent],
  ];
  for (const warm of warmStarts) {
    if (candidates.length >= CEM_CONFIG.candidatesPerGeneration) break;
    candidates.push(asWeights(warm));
  }
  while (candidates.length < CEM_CONFIG.candidatesPerGeneration) {
    candidates.push(
      asWeights(state.mean.map((center, index) => center + state.sigma[index] * gaussian(searchRng))),
    );
  }
  return candidates;
}

/**
 * Updates the search distribution from train-pool elites only.
 * Selection, promotion, and final results must not be passed here.
 */
export function updateFromTrainElites(
  state: CemState,
  trainElitesBestFirst: readonly PolicyWeights[],
): CemState {
  if (trainElitesBestFirst.length !== CEM_CONFIG.elites) {
    throw new Error(`CEM expects ${CEM_CONFIG.elites} train elites`);
  }
  const eliteMean = [0, 0, 0, 0].map((_, index) => {
    const total = trainElitesBestFirst.reduce((sum, weights) => sum + weights[index], 0);
    return total / trainElitesBestFirst.length;
  });
  const eliteSigma = eliteMean.map((center, index) => {
    const variance =
      trainElitesBestFirst.reduce((sum, weights) => {
        const delta = weights[index] - center;
        return sum + delta * delta;
      }, 0) / trainElitesBestFirst.length;
    return Math.sqrt(variance);
  });
  const blend = CEM_CONFIG.newMomentWeight;
  const keep = 1 - blend;
  return {
    generation: state.generation + 1,
    mean: asWeights(eliteMean.map((value, index) => blend * value + keep * state.mean[index])),
    sigma: asWeights(
      eliteSigma.map((value, index) =>
        Math.max(CEM_CONFIG.sigmaFloor, blend * value + keep * state.sigma[index]),
      ),
    ),
    searchIncumbent: asWeights(trainElitesBestFirst[0]),
  };
}
