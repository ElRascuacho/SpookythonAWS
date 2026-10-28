/**
 * Policy weights vector w = [w_cordon_early, w_fumigation_early, w_cordon_late, w_fumigation_late]
 * Each w_i is within [-3, 3].
 */
export type PolicyWeights = readonly [number, number, number, number];

export const WEIGHT_BOUNDS = {
  min: -3,
  max: 3,
} as const;

export const ZERO_POLICY_WEIGHTS: PolicyWeights = [0, 0, 0, 0] as const;

export type PoolType = 'baseline' | 'train' | 'selection' | 'promotion' | 'final';

export type RngStreamName = 'env' | 'search' | 'bootstrap' | 'decision';

export interface SeedPool {
  readonly size: number;
  readonly runIndices: readonly number[];
}

export interface SeedPools {
  readonly baseline: SeedPool;
  readonly train: SeedPool;
  readonly selection: SeedPool;
  readonly promotion: SeedPool;
  readonly final: SeedPool;
}

export interface CompatibilityVersions {
  readonly engineVersion: string;
  readonly graphVersion: string;
  readonly policyFamily: string;
  readonly prng: string;
  readonly normalSampler: string;
}

export const DEFAULT_COMPATIBILITY_VERSIONS: CompatibilityVersions = {
  engineVersion: 'seir-v1',
  graphVersion: 'manta-v1',
  policyFamily: 'four-weight-linear-v1',
  prng: 'mulberry32-v1',
  normalSampler: 'box-muller-v1',
} as const;

/**
 * Maximum entries allowed in the global policy library (algorithm.md §7).
 */
export const MAX_POLICY_LIBRARY_ENTRIES = 8;

/**
 * Policy library snapshot entry (algorithm.md §7, data-model.md).
 * No owner, jobId, seeds, or private history.
 */
export interface PolicyLibraryEntry {
  readonly entryId: string;
  readonly weights: PolicyWeights;
  readonly engineVersion: string;
  readonly graphVersion: string;
  readonly policyFamily: string;
  readonly horizonClass: number;
  readonly scoreHint?: number;
  readonly archivedAt: number;
}

/**
 * Trajectory budget per algorithm.md §4.
 */
export const PROTOCOL_BUDGET = {
  baseline: 96,
  training: 1536,
  selection: 384,
  promotion: 1024,
  finalAudit: 512,
  total: 3552,
  platformHardCap: 4096,
} as const;

/**
 * Normative replica pool sizes (algorithm.md §4, §6).
 */
export const POOL_SIZES = {
  baseline: 32,
  train: 8,
  selection: 24,
  promotion: 64,
  final: 128,
} as const;

export interface RngSeeds {
  readonly baseSeed: number;
  readonly envSeed: number;
  readonly searchSeed: number;
  readonly bootstrapSeed: number;
}

export interface RunManifest {
  readonly jobId: string;
  readonly scenarioHash: string;
  readonly versions: CompatibilityVersions;
  readonly pools: SeedPools;
  readonly librarySnapshot: readonly PolicyLibraryEntry[];
  readonly protocolBudget: number;
  readonly rngSeeds: RngSeeds;
  readonly createdAt: string;
  readonly weights?: PolicyWeights;
}
