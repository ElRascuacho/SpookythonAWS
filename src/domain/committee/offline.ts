import { createHash } from 'node:crypto';
import { DEFAULT_SIMULATION_PARAMS } from '../mantaGraph';
import { runSingleSeirSimulation } from '../seirEngine';
import type { DailyCitySnapshot, SimulationParams, StrategyType } from '../types';
import { CEM_CONFIG, initialCemState, proposeGeneration, updateFromTrainElites } from './cemSearch';
import { computeManifestHash, createRunManifest, createStreamRng } from './manifest';
import { attemptPromotion, auditFinalRecommendation, createPromotionState, selectSearchIncumbent } from './promotion';
import { PROTOCOL_BUDGET, ZERO_POLICY_WEIGHTS, type PolicyWeights, type PolicyLibraryEntry, type RunManifest } from './types';
import { createWeightedPolicy } from './weightedPolicy';

type Phase = 'baseline' | 'training' | 'selection' | 'promotion' | 'final' | 'evaluation';
type Policy = 'weighted' | 'sgc' | 'random' | 'none';
export interface SimulationInput { phase: Phase; policy: Policy; weights: PolicyWeights; runIndex: number; params: SimulationParams }
export interface SimulationOutput { totalCumulativeInfected: number; timeline: DailyCitySnapshot[] }
export type OfflineSimulator = (input: SimulationInput) => SimulationOutput;
export interface PolicyArtifact {
  readonly schemaVersion: 1;
  readonly policyVersion: number;
  readonly weights: PolicyWeights;
  readonly recommendation: 'trained' | 'sgc-fallback';
  readonly params: Readonly<SimulationParams>;
  readonly manifest: RunManifest;
  readonly manifestHash: string;
  readonly artifactHash: string;
}
export interface OfflineTrainingRequest { jobId: string; baseSeed: number; horizonDays: number; params?: Partial<SimulationParams>; librarySnapshot?: readonly PolicyLibraryEntry[]; simulate?: OfflineSimulator }
export type DailyDiagnostics = Pick<DailyCitySnapshot, 'day' | 'totalS' | 'totalE' | 'totalI' | 'totalR' | 'cumulativeInfected' | 'effectiveGamma' | 'hospitalCollapsed' | 'action'>;
export interface TrajectoryRecord { phase: Phase; policy: Policy; policyId: string; envNamespace: string; runIndex: number; outcome: number; timeline: DailyDiagnostics[] }
export interface OutcomeSummary { mean: number; p10: number; p90: number }
const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const summarize = (scores: readonly number[]): OutcomeSummary => {
  const sorted = [...scores].sort((a, b) => a - b);
  return { mean: mean(scores), p10: sorted[Math.floor((sorted.length - 1) * 0.1)], p90: sorted[Math.floor((sorted.length - 1) * 0.9)] };
};
const digestArtifact = (artifact: Omit<PolicyArtifact, 'artifactHash'>): string => createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};
const defaultSimulate: OfflineSimulator = ({ policy, weights, params, runIndex }) => {
  const strategy: StrategyType = policy === 'random' ? 'RANDOM' : policy === 'none' ? 'NO_INTERVENTION' : 'SMART_CORTAFUEGOS';
  return runSingleSeirSimulation(params, strategy, runIndex, undefined,
    policy === 'weighted' || policy === 'sgc'
      ? { onDailyDecision: createWeightedPolicy(policy === 'sgc' ? ZERO_POLICY_WEIGHTS : weights), envNamespace: 'committee-env' }
      : undefined);
};

/** Explicit operator-run training; never called by the deployed preview worker. */
export function trainOffline(request: OfflineTrainingRequest) {
  const days = Math.min(60, Math.max(20, Math.round(request.horizonDays)));
  const params: SimulationParams = { ...DEFAULT_SIMULATION_PARAMS, ...request.params, patientZeroIds: [...(request.params?.patientZeroIds ?? DEFAULT_SIMULATION_PARAMS.patientZeroIds)], seed: request.baseSeed, days };
  const scenarioHash = createHash('sha256').update(JSON.stringify(params)).digest('hex');
  const librarySnapshot = (request.librarySnapshot ?? []).map(entry => ({ ...entry, weights: [...entry.weights] as PolicyWeights }));
  const manifest = createRunManifest({ jobId: request.jobId, scenarioHash, baseSeed: request.baseSeed, librarySnapshot, createdAt: '1970-01-01T00:00:00.000Z' });
  const warmStarts = manifest.librarySnapshot.filter(entry => entry.engineVersion === manifest.versions.engineVersion && entry.graphVersion === manifest.versions.graphVersion && entry.policyFamily === manifest.versions.policyFamily && entry.horizonClass === days).map(entry => {
    if (entry.weights.some(value => !Number.isFinite(value) || value < -3 || value > 3)) throw new RangeError('Invalid warm start weights');
    return entry.weights;
  });
  if (manifest.protocolBudget !== PROTOCOL_BUDGET.total || manifest.protocolBudget > PROTOCOL_BUDGET.platformHardCap) throw new Error('Invalid training budget');
  const ledger: TrajectoryRecord[] = [];
  const simulate = request.simulate ?? defaultSimulate;
  const score = (phase: Phase, policy: Policy, weights: PolicyWeights, indices: readonly number[]) => indices.map(runIndex => {
    if (ledger.length >= PROTOCOL_BUDGET.total) throw new Error('Training trajectory budget exceeded');
    const result = simulate({ phase, policy, weights, runIndex, params });
    if (!Number.isFinite(result.totalCumulativeInfected)) throw new Error('Non-finite trajectory outcome');
    const policyId = policy === 'weighted' ? `weighted:${JSON.stringify(weights)}` : policy;
    const envNamespace = policy === 'random' ? 'RANDOM' : policy === 'none' ? 'NO_INTERVENTION' : 'committee-env';
    const timeline = result.timeline.map(({ day, totalS, totalE, totalI, totalR, cumulativeInfected, effectiveGamma, hospitalCollapsed, action }) =>
      ({ day, totalS, totalE, totalI, totalR, cumulativeInfected, effectiveGamma, hospitalCollapsed, action }));
    ledger.push({ phase, policy, policyId, envNamespace, runIndex, outcome: result.totalCumulativeInfected, timeline });
    return result.totalCumulativeInfected;
  });
  const baseline = Object.fromEntries((['sgc', 'random', 'none'] as const).map(policy => [policy, summarize(score('baseline', policy, ZERO_POLICY_WEIGHTS, manifest.pools.baseline.runIndices))])) as Record<'sgc' | 'random' | 'none', OutcomeSummary>;
  const searchRng = createStreamRng('search', manifest.rngSeeds);
  const bootstrapRng = createStreamRng('bootstrap', manifest.rngSeeds);
  let cem = initialCemState();
  let promotion = createPromotionState();
  for (let generation = 0; generation < CEM_CONFIG.generations; generation++) {
    const previousIncumbent = cem.searchIncumbent;
    const ranked = proposeGeneration(cem, searchRng, warmStarts).map(weights => ({ weights, score: mean(score('training', 'weighted', weights, manifest.pools.train.runIndices)) }))
      .sort((a, b) => a.score - b.score || JSON.stringify(a.weights).localeCompare(JSON.stringify(b.weights)));
    cem = updateFromTrainElites(cem, ranked.slice(0, CEM_CONFIG.elites).map(row => row.weights));
    const selected = selectSearchIncumbent(ranked[0].weights, previousIncumbent, manifest.pools, generation, (candidate, incumbent, indices) => ({ candidate: score('selection', 'weighted', candidate, indices), incumbent: score('selection', 'weighted', incumbent, indices) }));
    promotion = attemptPromotion(promotion, selected, manifest.pools, bootstrapRng, (candidate, incumbent, indices) => ({ candidate: score('promotion', 'weighted', candidate, indices), incumbent: score('promotion', 'weighted', incumbent, indices) })).state;
  }
  let final!: Record<'candidate' | 'sgc' | 'random' | 'none', OutcomeSummary>;
  promotion = auditFinalRecommendation(promotion, manifest.pools.final, bootstrapRng, (candidate, indices) => {
    const scores = { candidate: score('final', 'weighted', candidate, indices), sgc: score('final', 'sgc', ZERO_POLICY_WEIGHTS, indices), random: score('final', 'random', ZERO_POLICY_WEIGHTS, indices), none: score('final', 'none', ZERO_POLICY_WEIGHTS, indices) };
    final = { candidate: summarize(scores.candidate), sgc: summarize(scores.sgc), random: summarize(scores.random), none: summarize(scores.none) };
    return scores;
  });
  const contents: Omit<PolicyArtifact, 'artifactHash'> = { schemaVersion: 1, policyVersion: promotion.recommendedPolicyVersion, weights: [...(promotion.recommendedPolicyVersion ? promotion.publishedWeights : ZERO_POLICY_WEIGHTS)] as PolicyWeights, recommendation: promotion.recommendedPolicyVersion ? 'trained' : 'sgc-fallback', params, manifest, manifestHash: computeManifestHash(manifest) };
  const artifact: PolicyArtifact = deepFreeze({ ...contents, artifactHash: digestArtifact(contents) });
  return { artifact, audit: promotion.finalAudit, finalEvidence: promotion.finalEvidence, promotion, baseline, final, trajectories: ledger.length, ledger };
}

export interface FrozenPolicyEvaluationRequest { artifact: PolicyArtifact; policyVersion: number; baseSeed: number; pairs?: number; simulate?: OfflineSimulator }
export interface EvaluationPair { runIndex: number; candidate: SimulationOutput; sgc: SimulationOutput }

function prepareEvaluation(request: FrozenPolicyEvaluationRequest) {
  const { artifact } = request;
  if (request.policyVersion !== artifact.policyVersion) throw new Error('Policy version mismatch');
  if (computeManifestHash(artifact.manifest) !== artifact.manifestHash) throw new Error('Manifest integrity mismatch');
  const { artifactHash, ...contents } = artifact;
  if (digestArtifact(contents) !== artifactHash) throw new Error('Artifact integrity mismatch');
  const pairs = request.pairs ?? 128;
  if (!Number.isInteger(pairs) || pairs < 2 || pairs > 2048) throw new RangeError('Pairs must be an integer between 2 and 2048');
  const weights = Object.freeze([...artifact.weights]) as PolicyWeights;
  const params = { ...artifact.params, patientZeroIds: [...artifact.params.patientZeroIds], seed: request.baseSeed };
  const simulate = request.simulate ?? defaultSimulate;
  const start = Math.max(...artifact.manifest.pools.final.runIndices) + 1;
  const summaryContext = { policyVersion: artifact.policyVersion, baseSeed: request.baseSeed, rngSeeds: { ...artifact.manifest.rngSeeds } };
  const runPair = (i: number): EvaluationPair => {
    const runIndex = start + i;
    const candidate = simulate({ phase: 'evaluation', policy: 'weighted', weights, runIndex, params });
    const sgc = simulate({ phase: 'evaluation', policy: 'sgc', weights: ZERO_POLICY_WEIGHTS, runIndex, params });
    if (!Number.isFinite(candidate.totalCumulativeInfected) || !Number.isFinite(sgc.totalCumulativeInfected)) throw new Error('Non-finite trajectory outcome');
    return { runIndex, candidate, sgc };
  };
  return { pairs, runPair, summaryContext };
}

function summarizeEvaluation(context: { policyVersion: number; baseSeed: number; rngSeeds: PolicyArtifact['manifest']['rngSeeds'] }, runs: EvaluationPair[]) {
  const pairs = runs.length;
  const differences = runs.map(run => run.sgc.totalCumulativeInfected - run.candidate.totalCumulativeInfected);
  const rng = createStreamRng('bootstrap', { ...context.rngSeeds, baseSeed: context.baseSeed, bootstrapSeed: context.baseSeed >>> 0 });
  const samples = Array.from({ length: 2000 }, () => mean(Array.from({ length: pairs }, () => differences[Math.floor(rng() * pairs)]))).sort((a, b) => a - b);
  return { policyVersion: context.policyVersion, trajectories: pairs * 2, runs, candidateMean: mean(runs.map(r => r.candidate.totalCumulativeInfected)), sgcMean: mean(runs.map(r => r.sgc.totalCumulativeInfected)), meanImprovement: mean(differences), confidenceInterval: [samples[49], samples[1949]] as [number, number] };
}

/** Evaluate a specific immutable policy version against SGC without updating it. */
export function evaluateFrozenPolicy(request: FrozenPolicyEvaluationRequest) {
  const { pairs, runPair, summaryContext } = prepareEvaluation(request);
  return summarizeEvaluation(summaryContext, Array.from({ length: pairs }, (_, i) => runPair(i)));
}

export interface SequentialEvaluationRequest extends FrozenPolicyEvaluationRequest {
  shouldCancel: () => Promise<boolean>;
  persistPair: (progress: { completedPairs: number; totalPairs: number; run: EvaluationPair }) => Promise<void>;
}
export type SequentialEvaluationResult =
  | { status: 'completed'; summary: ReturnType<typeof summarizeEvaluation> }
  | { status: 'cancelled'; completedPairs: number; totalPairs: number; runs: EvaluationPair[] };

/** Persist each paired result before checking cancellation and starting the next pair. */
export async function evaluateFrozenPolicySequential(request: SequentialEvaluationRequest): Promise<SequentialEvaluationResult> {
  const { pairs, runPair, summaryContext } = prepareEvaluation(request);
  const runs: EvaluationPair[] = [];
  for (let i = 0; i < pairs; i++) {
    if (await request.shouldCancel()) return { status: 'cancelled', completedPairs: runs.length, totalPairs: pairs, runs };
    const run = runPair(i);
    await request.persistPair({ completedPairs: i + 1, totalPairs: pairs, run: structuredClone(run) });
    runs.push(run);
  }
  return { status: 'completed', summary: summarizeEvaluation(summaryContext, runs) };
}
