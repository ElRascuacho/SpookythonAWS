import { createHash } from 'node:crypto';
import { hashSeed, mulberry32, type RngFunction } from '../prng';
import {
  DEFAULT_COMPATIBILITY_VERSIONS,
  MAX_POLICY_LIBRARY_ENTRIES,
  POOL_SIZES,
  PROTOCOL_BUDGET,
  type CompatibilityVersions,
  type PolicyLibraryEntry,
  type PolicyWeights,
  type RngSeeds,
  type RngStreamName,
  type SeedPool,
  type SeedPools,
  type RunManifest,
} from './types';

export class PoolCollisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PoolCollisionError';
  }
}

export interface PoolPartitionOptions {
  readonly baselineOffset?: number;
  readonly trainOffset?: number;
  readonly selectionOffset?: number;
  readonly promotionOffset?: number;
  readonly finalOffset?: number;
}

const MAX_ROUNDS = 8;

/** Returns the fresh, deterministic selection pool reserved for one generation. */
export function getSelectionPool(pools: SeedPools, generation: number): SeedPool {
  return getRoundPool(pools.selection, generation);
}

/** Returns the fresh, deterministic promotion pool reserved for one attempt. */
export function getPromotionPool(pools: SeedPools, attempt: number): SeedPool {
  return getRoundPool(pools.promotion, attempt);
}

function getRoundPool(first: SeedPool, round: number): SeedPool {
  if (!Number.isInteger(round) || round < 0 || round >= MAX_ROUNDS) {
    throw new RangeError(`Pool round must be an integer from 0 to ${MAX_ROUNDS - 1}`);
  }
  if (round === 0) return first;
  const firstIndex = first.runIndices[0];
  if (!Number.isSafeInteger(firstIndex) || first.size < 1) {
    throw new PoolCollisionError('Round pool requires a nonempty integer base range');
  }
  return {
    size: first.size,
    runIndices: Object.freeze(Array.from({ length: first.size }, (_, i) => firstIndex + round * first.size + i)),
  };
}

/**
 * Creates deterministic disjoint seed pools for committee phases (algorithm.md §3, §4).
 * Default partitions ensure:
 * - baseline:  [0..31]     (32 replicas)
 * - train:     [32..39]    (8 replicas)
 * - selection: [40..63]    (24 replicas)
 * - selection generations 1..7: [64..231]
 * - promotion attempts 0..7: [232..743] (64 replicas each)
 * - final:     [744..871]  (128 replicas)
 */
export function createDeterministicPools(options?: PoolPartitionOptions): SeedPools {
  const baselineOffset = options?.baselineOffset ?? 0;
  const trainOffset = options?.trainOffset ?? baselineOffset + POOL_SIZES.baseline;
  const selectionOffset = options?.selectionOffset ?? trainOffset + POOL_SIZES.train;
  const promotionOffset = options?.promotionOffset ?? selectionOffset + MAX_ROUNDS * POOL_SIZES.selection;
  const finalOffset = options?.finalOffset ?? promotionOffset + MAX_ROUNDS * POOL_SIZES.promotion;

  const baselineIndices = Array.from({ length: POOL_SIZES.baseline }, (_, i) => baselineOffset + i);
  const trainIndices = Array.from({ length: POOL_SIZES.train }, (_, i) => trainOffset + i);
  const selectionIndices = Array.from({ length: POOL_SIZES.selection }, (_, i) => selectionOffset + i);
  const promotionIndices = Array.from({ length: POOL_SIZES.promotion }, (_, i) => promotionOffset + i);
  const finalIndices = Array.from({ length: POOL_SIZES.final }, (_, i) => finalOffset + i);

  const pools: SeedPools = {
    baseline: { size: POOL_SIZES.baseline, runIndices: Object.freeze(baselineIndices) },
    train: { size: POOL_SIZES.train, runIndices: Object.freeze(trainIndices) },
    selection: { size: POOL_SIZES.selection, runIndices: Object.freeze(selectionIndices) },
    promotion: { size: POOL_SIZES.promotion, runIndices: Object.freeze(promotionIndices) },
    final: { size: POOL_SIZES.final, runIndices: Object.freeze(finalIndices) },
  };

  validateDisjointPools(pools);
  return pools;
}

/**
 * Verifies that all pools contain distinct run indices and that no two pools share any index.
 * Throws PoolCollisionError upon detecting any internal or cross-pool collision.
 */
export function validateDisjointPools(pools: SeedPools): void {
  const poolEntries: Array<[string, SeedPool]> = [
    ['baseline', pools.baseline],
    ['train', pools.train],
    ['final', pools.final],
  ];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    poolEntries.push([`selection-${round}`, getSelectionPool(pools, round)]);
    poolEntries.push([`promotion-${round}`, getPromotionPool(pools, round)]);
  }

  const seen = new Map<number, string>();

  for (const [poolName, pool] of poolEntries) {
    if (pool.runIndices.length !== pool.size) {
      throw new PoolCollisionError(
        `Pool '${poolName}' declared size ${pool.size} does not match runIndices count ${pool.runIndices.length}`,
      );
    }

    const localSet = new Set<number>();
    for (const index of pool.runIndices) {
      if (localSet.has(index)) {
        throw new PoolCollisionError(
          `Pool '${poolName}' has duplicate runIndex ${index} within its own set`,
        );
      }
      localSet.add(index);

      const existingOwner = seen.get(index);
      if (existingOwner) {
        throw new PoolCollisionError(
          `RunIndex collision detected: index ${index} belongs to both '${existingOwner}' and '${poolName}'`,
        );
      }
      seen.set(index, poolName);
    }
  }
}

/**
 * Derives well-distributed stream seeds for the 4 PRNG namespaces (algorithm.md §3).
 */
export function deriveStreamSeeds(baseSeed: number): RngSeeds {
  return {
    baseSeed: baseSeed >>> 0,
    envSeed: hashSeed(baseSeed, 0x454e565f, 0), // "ENV_"
    searchSeed: hashSeed(baseSeed, 0x53524348, 0), // "SRCH"
    bootstrapSeed: hashSeed(baseSeed, 0x424f4f54, 0), // "BOOT"
  };
}

/**
 * Creates a deterministic PRNG for a given namespace stream.
 * CRITICAL invariant (algorithm.md §3):
 * - 'env' stream depends ONLY on (envSeed, runIndex), strictly independent of policy weights or identity.
 * - 'search', 'bootstrap', and 'decision' have dedicated streams that do not collide with 'env'.
 */
export function createStreamRng(
  stream: RngStreamName,
  seeds: RngSeeds,
  runIndex: number = 0,
): RngFunction {
  switch (stream) {
    case 'env': {
      const combined = hashSeed(seeds.envSeed, 0x656e76, runIndex);
      return mulberry32(combined);
    }
    case 'search': {
      const combined = hashSeed(seeds.searchSeed, 0x736561726368, runIndex);
      return mulberry32(combined);
    }
    case 'bootstrap': {
      const combined = hashSeed(seeds.bootstrapSeed, 0x626f6f74, runIndex);
      return mulberry32(combined);
    }
    case 'decision': {
      const combined = hashSeed(seeds.baseSeed, 0x646563697369, runIndex);
      return mulberry32(combined);
    }
  }
}

/**
 * Calculates total planned trajectories according to algorithm.md §4:
 * Baseline:  32 x 3 = 96
 * Training:  8 gen x 24 cand x 8 train = 1536
 * Selection: 8 gen x 2 cand x 24 sel = 384
 * Promotion: 64 pairs x 2 x 8 = 1024
 * Final:     128 x 4 = 512
 * Total:     3552
 */
export function calculateProtocolBudget(pools: SeedPools): number {
  const baseline = pools.baseline.size * 3;
  const training = 8 * 24 * pools.train.size;
  const selection = 8 * 2 * pools.selection.size;
  const promotion = pools.promotion.size * 2 * 8;
  const finalAudit = pools.final.size * 4;
  const total = baseline + training + selection + promotion + finalAudit;

  if (total > PROTOCOL_BUDGET.platformHardCap) {
    throw new Error(
      `Protocol budget calculation (${total}) exceeds platform hard cap (${PROTOCOL_BUDGET.platformHardCap})`,
    );
  }

  return total;
}

/**
 * Validates the policy library snapshot (algorithm.md §7, AC-15).
 * - Maximum 8 entries.
 * - Weights and compatibility metadata only.
 * - Prohibits owner, jobId, seeds, or private history leaks.
 */
export function validateLibrarySnapshot(snapshot: readonly PolicyLibraryEntry[]): void {
  if (snapshot.length > MAX_POLICY_LIBRARY_ENTRIES) {
    throw new Error(
      `Policy library snapshot exceeds maximum allowed entries (${MAX_POLICY_LIBRARY_ENTRIES}): got ${snapshot.length}`,
    );
  }

  const forbiddenKeys = ['owner', 'ownerHash', 'jobId', 'seeds', 'seed', 'history', 'userId'];

  for (const entry of snapshot) {
    if (!entry.entryId || typeof entry.entryId !== 'string') {
      throw new Error(`Invalid library entry: missing string entryId`);
    }
    if (!Array.isArray(entry.weights) || entry.weights.length !== 4) {
      throw new Error(`Invalid library entry: weights must be a 4-vector`);
    }
    for (const key of forbiddenKeys) {
      if (key in entry) {
        throw new Error(`Policy library entry contains forbidden private field: ${key}`);
      }
    }
  }
}

export interface CreateRunManifestParams {
  readonly jobId: string;
  readonly scenarioHash: string;
  readonly baseSeed: number;
  readonly versions?: Partial<CompatibilityVersions>;
  readonly pools?: SeedPools;
  readonly librarySnapshot?: readonly PolicyLibraryEntry[];
  readonly createdAt?: string;
  readonly weights?: PolicyWeights;
}

/**
 * Assembles and validates a complete RunManifest object.
 */
export function createRunManifest(params: CreateRunManifestParams): RunManifest {
  const versions: CompatibilityVersions = {
    ...DEFAULT_COMPATIBILITY_VERSIONS,
    ...(params.versions ?? {}),
  };

  const pools = params.pools ?? createDeterministicPools();
  validateDisjointPools(pools);

  const librarySnapshot = params.librarySnapshot ?? [];
  validateLibrarySnapshot(librarySnapshot);

  const budget = calculateProtocolBudget(pools);
  const rngSeeds = deriveStreamSeeds(params.baseSeed);

  return {
    jobId: params.jobId,
    scenarioHash: params.scenarioHash,
    versions,
    pools,
    librarySnapshot,
    protocolBudget: budget,
    rngSeeds,
    createdAt: params.createdAt ?? new Date().toISOString(),
    ...(params.weights ? { weights: params.weights } : {}),
  };
}

/**
 * Deterministically sorts object keys recursively for canonical JSON serialization.
 */
function canonicalizeJson(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeJson);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result: Record<string, any> = {};
  for (const key of sortedKeys) {
    result[key] = canonicalizeJson(obj[key]);
  }
  return result;
}

/**
 * Canonical JSON serializer for RunManifest.
 */
export function serializeRunManifest(manifest: RunManifest, pretty = false): string {
  const canonical = canonicalizeJson(manifest);
  return pretty ? JSON.stringify(canonical, null, 2) : JSON.stringify(canonical);
}

/**
 * Deserializes JSON string to RunManifest and runs comprehensive validation.
 */
export function deserializeRunManifest(jsonStr: string): RunManifest {
  const parsed = JSON.parse(jsonStr);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid RunManifest JSON: must be an object');
  }

  const requiredFields = ['jobId', 'scenarioHash', 'versions', 'pools', 'librarySnapshot', 'protocolBudget', 'rngSeeds'];
  for (const field of requiredFields) {
    if (!(field in parsed)) {
      throw new Error(`Invalid RunManifest JSON: missing required field '${field}'`);
    }
  }

  validateDisjointPools(parsed.pools);
  validateLibrarySnapshot(parsed.librarySnapshot);

  const expectedBudget = calculateProtocolBudget(parsed.pools);
  if (parsed.protocolBudget !== expectedBudget) {
    throw new Error(
      `Manifest protocolBudget mismatch: declared ${parsed.protocolBudget}, calculated ${expectedBudget}`,
    );
  }

  return parsed as RunManifest;
}

/**
 * Computes a SHA-256 integrity hash of a RunManifest.
 */
export function computeManifestHash(manifestOrJson: RunManifest | string): string {
  const json = typeof manifestOrJson === 'string'
    ? manifestOrJson
    : serializeRunManifest(manifestOrJson);
  return createHash('sha256').update(json).digest('hex');
}
