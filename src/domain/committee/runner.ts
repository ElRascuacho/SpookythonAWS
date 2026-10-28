import { DEFAULT_SIMULATION_PARAMS } from "../mantaGraph";
import { runSingleSeirSimulation } from "../seirEngine";
import type { DailyCitySnapshot, SimulationParams } from "../types";
import {
  initialCemState,
  proposeGeneration,
  updateFromTrainElites,
  type CemState,
} from "./cemSearch";
import { filterCompatibleWarmStarts } from "./library";
import { createRunManifest, createStreamRng, deriveStreamSeeds } from "./manifest";
import { attemptPromotion, auditFinalRecommendation, createPromotionState } from "./promotion";
import { createWeightedPolicy } from "./weightedPolicy";
import {
  ZERO_POLICY_WEIGHTS,
  type PolicyLibraryEntry,
  type PolicyWeights,
  type SeedPools,
} from "./types";

export interface CommitteeRunLimits {
  generations?: number;
  trainIndices?: readonly number[];
  /** Preview does not spend the 64-replicate promotion pool unless true. */
  includePromotion?: boolean;
  /** Evaluate 128 held-out seeds for rigorous audit. */
  includeFinalAudit?: boolean;
}

export interface CommitteeRunRequest {
  jobId: string;
  baseSeed: number;
  horizonDays: number;
  params?: Partial<SimulationParams>;
  pools?: SeedPools;
  librarySnapshot?: readonly PolicyLibraryEntry[];
  limits?: CommitteeRunLimits;
  shouldCancel?: () => boolean;
}

export interface CommitteeRunResult {
  status: "completed" | "cancelled";
  stateRevision: number;
  recommendedPolicyVersion: number;
  finalAudit: "not-run" | "passed" | "failed";
  weights: PolicyWeights;
  baselineMean: number;
  candidateMean: number | null;
  trajectories: number;
  playback: DailyCitySnapshot[];
  note: string;
  seedUsed?: number;
  promoted?: boolean;
  warmStartsCount?: number;
  generationsRun?: number;
  librarySize?: number;
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
  const warmStarts = filterCompatibleWarmStarts(request.librarySnapshot ?? [], horizonDays);
  const manifest = createRunManifest({
    jobId: request.jobId,
    scenarioHash: `seed:${request.baseSeed}:h:${horizonDays}`,
    baseSeed: request.baseSeed,
    pools: request.pools,
    librarySnapshot: request.librarySnapshot,
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

  const scorePolicy = (
    policy: "weighted" | "sgc" | "random" | "none",
    policyWeights: PolicyWeights,
    indices: readonly number[],
  ): number[] => {
    const strategy = policy === "random" ? "RANDOM" : policy === "none" ? "NO_INTERVENTION" : "SMART_CORTAFUEGOS";
    const onDailyDecision = policy === "weighted" || policy === "sgc"
      ? createWeightedPolicy(policy === "sgc" ? ZERO_POLICY_WEIGHTS : policyWeights)
      : undefined;
    return indices.map((runIndex) => {
      if (request.shouldCancel?.()) {
        cancelled = true;
        return Number.POSITIVE_INFINITY;
      }
      trajectories += 1;
      const run = runSingleSeirSimulation(params, strategy, runIndex, undefined, onDailyDecision ? {
        onDailyDecision,
        envNamespace: "committee-env",
      } : undefined);
      return run.totalCumulativeInfected;
    });
  };

  const baselineScores = score([...ZERO_POLICY_WEIGHTS], trainIndices);
  if (cancelled) {
    return finishCancelled(request, params, trajectories, warmStarts.length, 0);
  }

  let state: CemState = initialCemState();
  let bestMean = Number.POSITIVE_INFINITY;
  let bestWeights: PolicyWeights = [...ZERO_POLICY_WEIGHTS];
  let generationsRun = 0;
  for (let generation = 0; generation < generations && !cancelled; generation += 1) {
    const candidates = proposeGeneration(state, searchRng, warmStarts);
    const ranked = candidates
      .map((weights) => ({ weights, mean: mean(score(weights, trainIndices)) }))
      .sort((a, b) => a.mean - b.mean || JSON.stringify(a.weights).localeCompare(JSON.stringify(b.weights)));
    if (cancelled) break;
    generationsRun += 1;
    if (ranked[0] && ranked[0].mean < bestMean) {
      bestMean = ranked[0].mean;
      bestWeights = ranked[0].weights;
    }
    state = updateFromTrainElites(state, ranked.slice(0, 6).map((row) => row.weights));
  }

  if (cancelled) return finishCancelled(request, params, trajectories, warmStarts.length, generationsRun);

  let recommendedPolicyVersion = 0;
  let stateRevision = 2;
  let weights = bestWeights;
  let promoted = false;
  let finalAudit: "not-run" | "passed" | "failed" = "not-run";
  let note = "Vista previa local: baseline y candidata sobre el pool de entrenamiento. La auditoría final no se ejecutó.";

  if (request.limits?.includePromotion) {
    let promotionState = createPromotionState();
    const promotion = attemptPromotion(
      promotionState,
      bestWeights,
      manifest.pools,
      createStreamRng("bootstrap", seeds, 0),
      (candidate, incumbent, runIndices) => {
        const candidateScores = score(candidate, runIndices);
        const incumbentScores = score(incumbent, runIndices);
        return { candidate: candidateScores, incumbent: incumbentScores };
      },
    );
    promotionState = promotion.state;
    promoted = promotion.promoted;
    recommendedPolicyVersion = promotionState.recommendedPolicyVersion;
    stateRevision = promotionState.stateRevision;
    weights = promotion.promoted ? promotionState.publishedWeights : [...ZERO_POLICY_WEIGHTS];

    if (request.limits?.includeFinalAudit) {
      promotionState = auditFinalRecommendation(
        promotionState,
        manifest.pools.final,
        createStreamRng("bootstrap", seeds, 1),
        (candidate, runIndices) => ({
          candidate: scorePolicy("weighted", candidate, runIndices),
          sgc: scorePolicy("sgc", ZERO_POLICY_WEIGHTS, runIndices),
          random: scorePolicy("random", ZERO_POLICY_WEIGHTS, runIndices),
          none: scorePolicy("none", ZERO_POLICY_WEIGHTS, runIndices),
        }),
      );
      recommendedPolicyVersion = promotionState.recommendedPolicyVersion;
      stateRevision = promotionState.stateRevision;
      finalAudit = promotionState.finalAudit;
      weights = promotionState.recommendedPolicyVersion > 0 ? promotionState.publishedWeights : [...ZERO_POLICY_WEIGHTS];
      note = finalAudit === "passed"
        ? "Auditoría en semillas ciegas superada: la candidata redujo contagios con significancia estadística."
        : "Auditoría final no superada: la candidata no demostró mejora reproducible sobre semillas ciegas (revertido a baseline).";
    } else {
      note = promoted
        ? "Promoción fuera de muestra superada: la política demostró mejora estadística y fue incorporada a la memoria evolutiva."
        : "Promoción evaluada en el pool del manifiesto: se conserva el incumbente para evitar sobreajuste.";
    }
  }

  const playback = runSingleSeirSimulation(
    params,
    "SMART_CORTAFUEGOS",
    trainIndices[0] ?? 0,
    undefined,
    { onDailyDecision: createWeightedPolicy(weights), envNamespace: "committee-env" },
  ).timeline;
  trajectories += 1;

  return {
    status: "completed",
    stateRevision,
    recommendedPolicyVersion,
    finalAudit,
    weights,
    baselineMean: mean(baselineScores),
    candidateMean: Number.isFinite(bestMean) ? bestMean : null,
    trajectories,
    playback,
    note,
    seedUsed: request.baseSeed,
    promoted,
    warmStartsCount: warmStarts.length,
    generationsRun,
  };
}

function finishCancelled(
  request: CommitteeRunRequest,
  params: SimulationParams,
  trajectories: number,
  warmStartsCount = 0,
  generationsRun = 0,
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
    seedUsed: request.baseSeed,
    promoted: false,
    warmStartsCount,
    generationsRun,
  };
}
