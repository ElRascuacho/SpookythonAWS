import { createHash } from 'node:crypto';
import { runSingleSeirSimulation } from '../seirEngine';
import type { SimulationParams, StrategyType } from '../types';
import { hashSeed } from '../prng';
import { SimulationParamsSchema } from '../schemas/simulationParams.schema';
import { assertPolicyArtifactIntegrity, type PolicyArtifact, type SimulationOutput } from './offline';
import { createStreamRng, deriveStreamSeeds } from './manifest';
import { DEFAULT_COMPATIBILITY_VERSIONS, WEIGHT_BOUNDS, ZERO_POLICY_WEIGHTS, type PolicyWeights } from './types';
import { createWeightedPolicy } from './weightedPolicy';

export const BENCHMARK_ENV_NAMESPACE = 'committee-benchmark-env-v1';
export const BENCHMARK_MIN_RUN_INDEX = 1_000_000;
type BenchmarkPolicy = 'weighted' | 'sgc' | 'random' | 'none';

export interface BenchmarkScenario {
  readonly id: string;
  readonly params: Readonly<SimulationParams>;
  readonly runIndices: readonly number[];
}

export interface BenchmarkPlan {
  readonly schemaVersion: 1;
  readonly scenarios: readonly BenchmarkScenario[];
}

export interface BenchmarkSimulationInput {
  readonly policy: BenchmarkPolicy;
  readonly weights: PolicyWeights;
  readonly params: SimulationParams;
  readonly runIndex: number;
  readonly envNamespace: typeof BENCHMARK_ENV_NAMESPACE;
}

export type BenchmarkSimulator = (input: BenchmarkSimulationInput) => SimulationOutput;

export interface BenchmarkRequest {
  readonly artifact: PolicyArtifact;
  readonly plan: BenchmarkPlan;
  readonly simulate?: BenchmarkSimulator;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, part]) => `${JSON.stringify(key)}:${canonical(part)}`).join(',')}}`;
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

function validate(request: BenchmarkRequest): void {
  const { artifact, plan } = request;
  assertPolicyArtifactIntegrity(artifact);
  if (artifact.weights.length !== 4 || artifact.weights.some(weight => !Number.isFinite(weight) || weight < WEIGHT_BOUNDS.min || weight > WEIGHT_BOUNDS.max)) throw new RangeError('Invalid policy weights');
  for (const [key, value] of Object.entries(DEFAULT_COMPATIBILITY_VERSIONS)) {
    if (artifact.manifest.versions[key as keyof typeof DEFAULT_COMPATIBILITY_VERSIONS] !== value) throw new Error('Incompatible policy or simulator version');
  }
  if (plan?.schemaVersion !== 1 || !Array.isArray(plan.scenarios) || plan.scenarios.length < 2 || plan.scenarios.length > 16) throw new RangeError('Benchmark requires 2 to 16 prespecified scenarios');
  const ids = new Set<string>();
  const seeds = new Set<number>();
  const indices = new Set<number>();
  for (const scenario of plan.scenarios) {
    if (!scenario.id || ids.has(scenario.id)) throw new Error('Duplicate or empty benchmark scenario id');
    ids.add(scenario.id);
    const { params, runIndices } = scenario;
    if (!params || params.days !== artifact.params.days) throw new Error('Benchmark horizon incompatible with frozen policy');
    if (!Number.isSafeInteger(params.seed) || params.seed < 0 || params.seed > 0xffffffff || params.seed === artifact.manifest.rngSeeds.baseSeed || seeds.has(params.seed)) throw new Error('Benchmark seeds must be fresh and distinct');
    seeds.add(params.seed);
    if (!SimulationParamsSchema.safeParse(params).success) throw new Error('Invalid benchmark scenario parameters');
    if (!Array.isArray(runIndices) || runIndices.length < 2 || runIndices.length > 128) throw new RangeError('Benchmark requires 2 to 128 pairs per scenario');
    for (const index of runIndices) {
      if (!Number.isSafeInteger(index) || index < BENCHMARK_MIN_RUN_INDEX || indices.has(index)) throw new Error('Benchmark run indices must be fresh and distinct');
      indices.add(index);
    }
  }
}

function defaultSimulate(input: BenchmarkSimulationInput): SimulationOutput {
  const strategy: StrategyType = input.policy === 'random' ? 'RANDOM' : input.policy === 'none' ? 'NO_INTERVENTION' : 'SMART_CORTAFUEGOS';
  return runSingleSeirSimulation(input.params, strategy, input.runIndex, undefined, {
    envNamespace: input.envNamespace,
    ...(input.policy === 'weighted' || input.policy === 'sgc'
      ? { onDailyDecision: createWeightedPolicy(input.weights) } : {}),
  });
}

/** A frozen, explicitly planned comparison; freshness of scenario types is a separate provenance claim. */
export function benchmarkFrozenPolicy(request: BenchmarkRequest) {
  validate(request);
  const plan = deepFreeze(structuredClone(request.plan));
  const frozenWeights = Object.freeze([...request.artifact.weights]) as unknown as PolicyWeights;
  const manifest = {
    schemaVersion: 1 as const,
    artifactHash: request.artifact.artifactHash,
    policyVersion: request.artifact.policyVersion,
    compatibilityVersions: { ...request.artifact.manifest.versions },
    environmentNamespace: BENCHMARK_ENV_NAMESPACE,
    planHash: createHash('sha256').update(canonical(plan)).digest('hex'),
    scenarios: plan.scenarios.map(({ id, params, runIndices }) => ({ id, params, runIndices })),
    aggregateWeighting: 'equal-scenario' as const,
  };
  const simulate = request.simulate ?? defaultSimulate;
  const scenarios = plan.scenarios.map(scenario => {
    const pairs = scenario.runIndices.map(runIndex => {
      const scores = {} as Record<BenchmarkPolicy, number>;
      for (const policy of ['weighted', 'sgc', 'random', 'none'] as const) {
        const weights = policy === 'weighted' ? frozenWeights : ZERO_POLICY_WEIGHTS;
        const output = simulate({ policy, weights, params: scenario.params, runIndex, envNamespace: BENCHMARK_ENV_NAMESPACE });
        if (!Number.isFinite(output.totalCumulativeInfected) || output.totalCumulativeInfected < 0) throw new Error('Invalid benchmark trajectory outcome');
        scores[policy] = output.totalCumulativeInfected;
      }
      return { runIndex, candidate: scores.weighted, sgc: scores.sgc, random: scores.random, none: scores.none, improvement: scores.sgc - scores.weighted };
    });
    const differences = pairs.map(pair => pair.improvement);
    const rng = createStreamRng('bootstrap', deriveStreamSeeds(hashSeed(scenario.params.seed, 0x42454e43, 0)));
    const resamples = Array.from({ length: 2000 }, () => mean(Array.from({ length: differences.length }, () => differences[Math.floor(rng() * differences.length)]))).sort((a, b) => a - b);
    return {
      id: scenario.id,
      pairs,
      candidateMean: mean(pairs.map(pair => pair.candidate)),
      sgcMean: mean(pairs.map(pair => pair.sgc)),
      randomMean: mean(pairs.map(pair => pair.random)),
      noneMean: mean(pairs.map(pair => pair.none)),
      meanImprovement: mean(differences),
      confidenceInterval: [resamples[49], resamples[1949]] as [number, number],
      degradationRate: differences.filter(value => value < 0).length / differences.length,
      worstPairImprovement: Math.min(...differences),
    };
  });
  return {
    manifest,
    scenarios,
    aggregate: {
      weighting: 'equal-scenario' as const,
      meanImprovement: mean(scenarios.map(row => row.meanImprovement)),
      degradedScenarios: scenarios.filter(row => row.meanImprovement < 0).length,
      worstScenarioImprovement: Math.min(...scenarios.map(row => row.meanImprovement)),
    },
  };
}
