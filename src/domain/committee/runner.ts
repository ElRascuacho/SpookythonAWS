import { DEFAULT_SIMULATION_PARAMS } from "../mantaGraph";
import { runSingleSeirSimulation } from "../seirEngine";
import type { DailyCitySnapshot, SimulationParams } from "../types";
import {
  initialCemState,
  proposeGeneration,
  updateFromTrainElites,
  type CemState,
} from "./cemSearch";
import { createRunManifest, createStreamRng, deriveStreamSeeds } from "./manifest";
import { createWeightedPolicy } from "./weightedPolicy";
import { ZERO_POLICY_WEIGHTS, type PolicyWeights, type SeedPools } from "./types";

export interface CommitteeRunLimits {
  generations?: number;
  trainIndices?: readonly number[];
  /** Preview does not spend the 64-replicate promotion pool. */
  includePromotion?: boolean;
}

export interface CommitteeRunRequest {
  jobId: string;
  baseSeed: number;
  horizonDays: number;
  params?: Partial<SimulationParams>;
  pools?: SeedPools;
  limits?: CommitteeRunLimits;
  shouldCancel?: () => boolean;
}

export interface CommitteeRunResult {
  status: "completed" | "cancelled";
  stateRevision: number;
  recommendedPolicyVersion: number;
  finalAudit: "not-run";
  weights: PolicyWeights;
  baselineMean: number;
  candidateMean: number | null;
  trajectories: number;
  playback: DailyCitySnapshot[];
  note: string;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function runCommitteePreview(request: CommitteeRunRequest): CommitteeRunResult {
  const horizonDays = Math.min(60, Math.max(20, Math.round(request.horizonDays)));
  const params: SimulationParams = {
    ...DEFAULT_SIMULATION_PARAMS,
    ...request.params,
    seed: request.baseSeed,
    days: horizonDays,
  };
  const manifest = createRunManifest({
    jobId: request.jobId,
    scenarioHash: `seed:${request.baseSeed}:h:${horizonDays}`,
    baseSeed: request.baseSeed,
    pools: request.pools,
  });
  const trainIndices = request.limits?.trainIndices ?? manifest.pools.train.runIndices.slice(0, 1);
  const generations = request.limits?.generations ?? 1;
  const seeds = deriveStreamSeeds(request.baseSeed);
  const searchRng = createStreamRng("search", seeds, 0);
  let trajectories = 0;
  let cancelled = false;

  const score = (weights: PolicyWeights, indices: readonly number[]): number[] => {
    const policy = createWeightedPolicy(weights);
    return indices.map((runIndex) => {
      if (request.shouldCancel?.()) {
        cancelled = true;
        return Number.POSITIVE_INFINITY;
      }
      trajectories += 1;
      const run = runSingleSeirSimulation(params, "SMART_CORTAFUEGOS", runIndex, undefined, {
        onDailyDecision: policy,
        envNamespace: "committee-env",
      });
      return run.totalCumulativeInfected;
    });
  };

  const baselineScores = score([...ZERO_POLICY_WEIGHTS], trainIndices);
  if (cancelled) {
    return finishCancelled(request, params, trajectories);
  }

  let state: CemState = initialCemState();
  let bestMean = Number.POSITIVE_INFINITY;
  let bestWeights: PolicyWeights = [...ZERO_POLICY_WEIGHTS];
  for (let generation = 0; generation < generations && !cancelled; generation += 1) {
    const candidates = proposeGeneration(state, searchRng);
    const ranked = candidates
      .map((weights) => ({ weights, mean: mean(score(weights, trainIndices)) }))
      .sort((a, b) => a.mean - b.mean || JSON.stringify(a.weights).localeCompare(JSON.stringify(b.weights)));
    if (cancelled) break;
    if (ranked[0] && ranked[0].mean < bestMean) {
      bestMean = ranked[0].mean;
      bestWeights = ranked[0].weights;
    }
    state = updateFromTrainElites(state, ranked.slice(0, 6).map((row) => row.weights));
  }

  if (cancelled) return finishCancelled(request, params, trajectories);

  const playback = runSingleSeirSimulation(
    params,
    "SMART_CORTAFUEGOS",
    trainIndices[0] ?? 0,
    undefined,
    { onDailyDecision: createWeightedPolicy(bestWeights), envNamespace: "committee-env" },
  ).timeline;
  trajectories += 1;

  return {
    status: "completed",
    stateRevision: 2,
    recommendedPolicyVersion: 0,
    finalAudit: "not-run",
    weights: bestWeights,
    baselineMean: mean(baselineScores),
    candidateMean: Number.isFinite(bestMean) ? bestMean : null,
    trajectories,
    playback,
    note: request.limits?.includePromotion
      ? "La promoción completa no corre en la vista previa local."
      : "Vista previa local: baseline y candidata sobre el pool de entrenamiento. La auditoría final no se ejecutó.",
  };
}

function finishCancelled(
  request: CommitteeRunRequest,
  params: SimulationParams,
  trajectories: number,
): CommitteeRunResult {
  const playback = runSingleSeirSimulation(params, "SMART_CORTAFUEGOS", 0, undefined, {
    onDailyDecision: createWeightedPolicy([...ZERO_POLICY_WEIGHTS]),
    envNamespace: "committee-env",
  }).timeline;
  return {
    status: "cancelled",
    stateRevision: 2,
    recommendedPolicyVersion: 0,
    finalAudit: "not-run",
    weights: [...ZERO_POLICY_WEIGHTS],
    baselineMean: 0,
    candidateMean: null,
    trajectories,
    playback,
    note: "Cancelado antes de terminar la vista previa. Se conserva la baseline.",
  };
}
