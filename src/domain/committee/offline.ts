import { createHash } from 'node:crypto';
import { DEFAULT_SIMULATION_PARAMS } from '../mantaGraph';
import { runSingleSeirSimulation } from '../seirEngine';
import type { DailyCitySnapshot, SimulationParams, StrategyType } from '../types';
import { CEM_CONFIG, initialCemState, proposeGeneration, updateFromTrainElites } from './cemSearch';
import { computeManifestHash, createRunManifest, createStreamRng, getPromotionPool, getSelectionPool } from './manifest';
import { attemptPromotion, auditFinalRecommendation, createPromotionState, selectSearchIncumbent } from './promotion';
import { PROTOCOL_BUDGET, ZERO_POLICY_WEIGHTS, type PolicyWeights, type PolicyLibraryEntry, type RunManifest, type PublicPolicyProjection } from './types';
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

function prepareTraining(request: OfflineTrainingRequest) {
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
  return { params, manifest, warmStarts, simulate: request.simulate ?? defaultSimulate };
}

function trajectoryRecord(phase: Phase, policy: Policy, weights: PolicyWeights, runIndex: number, result: SimulationOutput): TrajectoryRecord {
  if (!Number.isFinite(result.totalCumulativeInfected)) throw new Error('Non-finite trajectory outcome');
  const policyId = policy === 'weighted' ? `weighted:${JSON.stringify(weights)}` : policy;
  const envNamespace = policy === 'random' ? 'RANDOM' : policy === 'none' ? 'NO_INTERVENTION' : 'committee-env';
  const timeline = result.timeline.map(({ day, totalS, totalE, totalI, totalR, cumulativeInfected, effectiveGamma, hospitalCollapsed, action }) =>
    ({ day, totalS, totalE, totalI, totalR, cumulativeInfected, effectiveGamma, hospitalCollapsed, action }));
  return { phase, policy, policyId, envNamespace, runIndex, outcome: result.totalCumulativeInfected, timeline };
}

/** Explicit operator-run training; never called by the deployed preview worker. */
export function trainOffline(request: OfflineTrainingRequest) {
  const { params, manifest, warmStarts, simulate } = prepareTraining(request);
  const ledger: TrajectoryRecord[] = [];
  const score = (phase: Phase, policy: Policy, weights: PolicyWeights, indices: readonly number[]) => indices.map(runIndex => {
    if (ledger.length >= PROTOCOL_BUDGET.total) throw new Error('Training trajectory budget exceeded');
    const result = simulate({ phase, policy, weights, runIndex, params });
    ledger.push(trajectoryRecord(phase, policy, weights, runIndex, result));
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

export interface SequentialTrainingRequest extends OfflineTrainingRequest {
  shouldCancel: () => Promise<boolean>;
  persistManifest?: (identity: { manifest: RunManifest; manifestHash: string }) => Promise<void>;
  persistTrajectory: (progress: { completedTrajectories: number; totalTrajectories: number; record: TrajectoryRecord }) => Promise<void>;
  deadlineAt?: number;
  now?: () => number;
}

export type SequentialTrainingResult =
  | { status: 'completed'; result: ReturnType<typeof trainOffline> }
  | { status: 'cancelled' | 'deadline-exceeded'; completedTrajectories: number; totalTrajectories: number };

class TrainingInterrupted extends Error {
  constructor(readonly status: 'cancelled' | 'deadline-exceeded') { super(status); }
}

/** Persist each deterministic trajectory before advancing; partial runs cannot produce a policy artifact. */
export async function trainOfflineSequential(request: SequentialTrainingRequest): Promise<SequentialTrainingResult> {
  if (request.deadlineAt !== undefined && !Number.isFinite(request.deadlineAt)) throw new RangeError('Invalid training deadline');
  const { params, manifest, warmStarts, simulate } = prepareTraining(request);
  const ledger: TrajectoryRecord[] = [];
  const checkInterrupted = async () => {
    if (request.deadlineAt !== undefined && (request.now ?? Date.now)() >= request.deadlineAt) throw new TrainingInterrupted('deadline-exceeded');
    if (await request.shouldCancel()) throw new TrainingInterrupted('cancelled');
  };
  const score = async (phase: Phase, policy: Policy, weights: PolicyWeights, indices: readonly number[]) => {
    const scores: number[] = [];
    for (const runIndex of indices) {
      await checkInterrupted();
      if (ledger.length >= PROTOCOL_BUDGET.total) throw new Error('Training trajectory budget exceeded');
      const result = simulate({ phase, policy, weights, runIndex, params });
      const record = trajectoryRecord(phase, policy, weights, runIndex, result);
      await request.persistTrajectory({ completedTrajectories: ledger.length + 1, totalTrajectories: manifest.protocolBudget, record: structuredClone(record) });
      ledger.push(record);
      scores.push(result.totalCumulativeInfected);
    }
    return scores;
  };
  try {
    await checkInterrupted();
    await request.persistManifest?.({ manifest: structuredClone(manifest), manifestHash: computeManifestHash(manifest) });
    const baseline = {} as Record<'sgc' | 'random' | 'none', OutcomeSummary>;
    for (const policy of ['sgc', 'random', 'none'] as const) baseline[policy] = summarize(await score('baseline', policy, ZERO_POLICY_WEIGHTS, manifest.pools.baseline.runIndices));
    const searchRng = createStreamRng('search', manifest.rngSeeds);
    const bootstrapRng = createStreamRng('bootstrap', manifest.rngSeeds);
    let cem = initialCemState();
    let promotion = createPromotionState();
    for (let generation = 0; generation < CEM_CONFIG.generations; generation++) {
      const previousIncumbent = cem.searchIncumbent;
      const ranked = [] as Array<{ weights: PolicyWeights; score: number }>;
      for (const weights of proposeGeneration(cem, searchRng, warmStarts)) ranked.push({ weights, score: mean(await score('training', 'weighted', weights, manifest.pools.train.runIndices)) });
      ranked.sort((a, b) => a.score - b.score || JSON.stringify(a.weights).localeCompare(JSON.stringify(b.weights)));
      cem = updateFromTrainElites(cem, ranked.slice(0, CEM_CONFIG.elites).map(row => row.weights));
      const selectionIndices = getSelectionPool(manifest.pools, generation).runIndices;
      const selectionCandidate = await score('selection', 'weighted', ranked[0].weights, selectionIndices);
      const selectionIncumbent = await score('selection', 'weighted', previousIncumbent, selectionIndices);
      const selected = selectSearchIncumbent(ranked[0].weights, previousIncumbent, manifest.pools, generation, () => ({ candidate: selectionCandidate, incumbent: selectionIncumbent }));
      const promotionIndices = getPromotionPool(manifest.pools, promotion.promotionAttempts).runIndices;
      const promotionCandidate = await score('promotion', 'weighted', selected, promotionIndices);
      const promotionIncumbent = await score('promotion', 'weighted', promotion.publishedWeights, promotionIndices);
      promotion = attemptPromotion(promotion, selected, manifest.pools, bootstrapRng, () => ({ candidate: promotionCandidate, incumbent: promotionIncumbent })).state;
    }
    const finalIndices = manifest.pools.final.runIndices;
    const finalScores = { candidate: await score('final', 'weighted', promotion.publishedWeights, finalIndices), sgc: await score('final', 'sgc', ZERO_POLICY_WEIGHTS, finalIndices), random: await score('final', 'random', ZERO_POLICY_WEIGHTS, finalIndices), none: await score('final', 'none', ZERO_POLICY_WEIGHTS, finalIndices) };
    await checkInterrupted();
    const final = { candidate: summarize(finalScores.candidate), sgc: summarize(finalScores.sgc), random: summarize(finalScores.random), none: summarize(finalScores.none) };
    promotion = auditFinalRecommendation(promotion, manifest.pools.final, bootstrapRng, () => finalScores);
    const contents: Omit<PolicyArtifact, 'artifactHash'> = { schemaVersion: 1, policyVersion: promotion.recommendedPolicyVersion, weights: [...(promotion.recommendedPolicyVersion ? promotion.publishedWeights : ZERO_POLICY_WEIGHTS)] as PolicyWeights, recommendation: promotion.recommendedPolicyVersion ? 'trained' : 'sgc-fallback', params, manifest, manifestHash: computeManifestHash(manifest) };
    const artifact: PolicyArtifact = deepFreeze({ ...contents, artifactHash: digestArtifact(contents) });
    return { status: 'completed', result: { artifact, audit: promotion.finalAudit, finalEvidence: promotion.finalEvidence, promotion, baseline, final, trajectories: ledger.length, ledger } };
  } catch (error) {
    if (error instanceof TrainingInterrupted) return { status: error.status, completedTrajectories: ledger.length, totalTrajectories: manifest.protocolBudget };
    throw error;
  }
}

export interface FrozenPolicyEvaluationRequest {
  artifact?: PolicyArtifact;
  policy?: PublicPolicyProjection | PolicyArtifact;
  policyVersion?: number;
  baseSeed: number;
  params?: SimulationParams;
  startIndex?: number;
  pairs?: number;
  simulate?: OfflineSimulator;
}
export interface EvaluationPair { runIndex: number; candidate: SimulationOutput; sgc: SimulationOutput }

function prepareEvaluation(request: FrozenPolicyEvaluationRequest) {
  const policyObj = request.policy ?? request.artifact;
  if (!policyObj) throw new Error('Policy or artifact required for evaluation');

  const isArtifact = 'manifest' in policyObj && 'artifactHash' in policyObj;
  let artifact: PolicyArtifact | undefined;
  let weights: PolicyWeights;
  let policyVersion: number;

  if (isArtifact) {
    artifact = policyObj as PolicyArtifact;
    assertPolicyArtifactIntegrity(artifact);
    policyVersion = artifact.policyVersion;
    weights = Object.freeze([...artifact.weights]) as PolicyWeights;
  } else {
    const proj = policyObj as PublicPolicyProjection;
    policyVersion = proj.policyVersion;
    weights = Object.freeze([...proj.weights]) as PolicyWeights;
    if (weights.length !== 4 || weights.some(n => !Number.isFinite(n) || n < -3 || n > 3)) {
      throw new Error('Invalid weights');
    }
  }

  if (request.policyVersion !== undefined && request.policyVersion !== policyVersion) {
    throw new Error('Policy version mismatch');
  }

  const pairs = request.pairs ?? 128;
  if (!Number.isInteger(pairs) || pairs < 2 || pairs > 2048) throw new RangeError('Pairs must be an integer between 2 and 2048');

  const sourceParams = request.params ?? artifact?.params;
  if (!sourceParams) {
    throw new Error('Evaluation requires requester simulation parameters');
  }
  const params = { ...sourceParams, patientZeroIds: [...sourceParams.patientZeroIds], seed: request.baseSeed };
  const simulate = request.simulate ?? defaultSimulate;

  const start = request.startIndex !== undefined
    ? request.startIndex
    : (artifact?.manifest?.pools?.final?.runIndices ? Math.max(...artifact.manifest.pools.final.runIndices) + 1 : 0);

  const summaryContext = {
    policyVersion,
    baseSeed: request.baseSeed,
    rngSeeds: artifact?.manifest?.rngSeeds,
  };

  const runPair = (i: number): EvaluationPair => {
    const runIndex = start + i;
    const candidate = simulate({ phase: 'evaluation', policy: 'weighted', weights, runIndex, params });
    const sgc = simulate({ phase: 'evaluation', policy: 'sgc', weights: ZERO_POLICY_WEIGHTS, runIndex, params });
    if (!Number.isFinite(candidate.totalCumulativeInfected) || !Number.isFinite(sgc.totalCumulativeInfected)) throw new Error('Non-finite trajectory outcome');
    return { runIndex, candidate, sgc };
  };
  return { pairs, runPair, summaryContext };
}

/** Shared integrity gate for frozen-policy consumers; it does not publish an artifact. */
export function assertPolicyArtifactIntegrity(artifact: PolicyArtifact): void {
  if (computeManifestHash(artifact.manifest) !== artifact.manifestHash) throw new Error('Manifest integrity mismatch');
  const { artifactHash, ...contents } = artifact;
  if (digestArtifact(contents) !== artifactHash) throw new Error('Artifact integrity mismatch');
}

function summarizeEvaluation(context: { policyVersion: number; baseSeed: number; rngSeeds?: PolicyArtifact['manifest']['rngSeeds'] }, runs: EvaluationPair[]) {
  const pairs = runs.length;
  const differences = runs.map(run => run.sgc.totalCumulativeInfected - run.candidate.totalCumulativeInfected);
  const rng = context.rngSeeds
    ? createStreamRng('bootstrap', { ...context.rngSeeds, baseSeed: context.baseSeed, bootstrapSeed: context.baseSeed >>> 0 })
    : createStreamRng('bootstrap', { baseSeed: context.baseSeed, envSeed: (context.baseSeed ^ 0x5a5a5a5a) >>> 0, searchSeed: (context.baseSeed ^ 0x3c3c3c3c) >>> 0, bootstrapSeed: context.baseSeed >>> 0 });
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
