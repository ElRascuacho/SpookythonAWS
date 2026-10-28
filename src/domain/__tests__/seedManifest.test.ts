import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_COMPATIBILITY_VERSIONS,
  MAX_POLICY_LIBRARY_ENTRIES,
  POOL_SIZES,
  PROTOCOL_BUDGET,
  PoolCollisionError,
  calculateProtocolBudget,
  computeManifestHash,
  createDeterministicPools,
  createRunManifest,
  createStreamRng,
  deriveStreamSeeds,
  deserializeRunManifest,
  serializeRunManifest,
  validateDisjointPools,
  validateLibrarySnapshot,
  type PolicyLibraryEntry,
  type SeedPools,
} from '../committee';

describe('T3: Seed Pools & Manifest Serializer (algorithm.md §3-§4, AC-09, AC-16)', () => {
  describe('Deterministic Disjoint Pools & Collision Checks', () => {
    it('creates pools with exact normative sizes per algorithm.md §4', () => {
      const pools = createDeterministicPools();
      expect(pools.baseline.size).toBe(32);
      expect(pools.train.size).toBe(8);
      expect(pools.selection.size).toBe(24);
      expect(pools.promotion.size).toBe(64);
      expect(pools.final.size).toBe(128);

      expect(pools.baseline.runIndices.length).toBe(32);
      expect(pools.train.runIndices.length).toBe(8);
      expect(pools.selection.runIndices.length).toBe(24);
      expect(pools.promotion.runIndices.length).toBe(64);
      expect(pools.final.runIndices.length).toBe(128);
    });

    it('guarantees 100% disjoint replica indices across all pool pairs', () => {
      const pools = createDeterministicPools();
      const poolList = [
        { name: 'baseline', set: new Set(pools.baseline.runIndices) },
        { name: 'train', set: new Set(pools.train.runIndices) },
        { name: 'selection', set: new Set(pools.selection.runIndices) },
        { name: 'promotion', set: new Set(pools.promotion.runIndices) },
        { name: 'final', set: new Set(pools.final.runIndices) },
      ];

      for (let i = 0; i < poolList.length; i++) {
        for (let j = i + 1; j < poolList.length; j++) {
          const poolA = poolList[i];
          const poolB = poolList[j];
          for (const idx of poolA.set) {
            expect(poolB.set.has(idx)).toBe(false);
          }
        }
      }
    });

    it('is strictly deterministic across repeated invocations', () => {
      const pools1 = createDeterministicPools();
      const pools2 = createDeterministicPools();
      expect(pools1).toEqual(pools2);
    });

    it('throws PoolCollisionError if an index collides across pools', () => {
      const valid = createDeterministicPools();
      // Introduce collision: put index 0 into both baseline and final
      const collidingPools: SeedPools = {
        ...valid,
        final: {
          size: 128,
          runIndices: [0, ...valid.final.runIndices.slice(1)],
        },
      };

      expect(() => validateDisjointPools(collidingPools)).toThrow(PoolCollisionError);
    });

    it('throws PoolCollisionError on internal duplicates within a pool', () => {
      const valid = createDeterministicPools();
      const duplicatePools: SeedPools = {
        ...valid,
        train: {
          size: 8,
          runIndices: [32, 32, 34, 35, 36, 37, 38, 39],
        },
      };

      expect(() => validateDisjointPools(duplicatePools)).toThrow(PoolCollisionError);
    });

    it('throws PoolCollisionError if declared size does not match runIndices length', () => {
      const valid = createDeterministicPools();
      const mismatchPools: SeedPools = {
        ...valid,
        train: {
          size: 8,
          runIndices: [32, 33, 34],
        },
      };

      expect(() => validateDisjointPools(mismatchPools)).toThrow(PoolCollisionError);
    });
  });

  describe('PRNG Streams & Policy-Independent Environment Namespace (algorithm.md §3)', () => {
    const baseSeed = 20261030;
    const seeds = deriveStreamSeeds(baseSeed);

    it('derives distinct 32-bit seeds for each stream namespace', () => {
      expect(seeds.baseSeed).toBe(20261030);
      expect(typeof seeds.envSeed).toBe('number');
      expect(typeof seeds.searchSeed).toBe('number');
      expect(typeof seeds.bootstrapSeed).toBe('number');

      const set = new Set([seeds.baseSeed, seeds.envSeed, seeds.searchSeed, seeds.bootstrapSeed]);
      expect(set.size).toBe(4);
    });

    it('env stream depends strictly on (envSeed, runIndex), not on policy or learned state', () => {
      const rng1 = createStreamRng('env', seeds, 42);
      const rng2 = createStreamRng('env', seeds, 42);

      const draws1 = Array.from({ length: 10 }, () => rng1());
      const draws2 = Array.from({ length: 10 }, () => rng2());

      expect(draws1).toEqual(draws2);
    });

    it('different streams produce distinct sequences for the same index', () => {
      const envRng = createStreamRng('env', seeds, 0);
      const searchRng = createStreamRng('search', seeds, 0);
      const bootRng = createStreamRng('bootstrap', seeds, 0);

      const envDraw = envRng();
      const searchDraw = searchRng();
      const bootDraw = bootRng();

      expect(envDraw).not.toBe(searchDraw);
      expect(envDraw).not.toBe(bootDraw);
      expect(searchDraw).not.toBe(bootDraw);
    });
  });

  describe('Protocol Budget Calculation & Platform Cap (algorithm.md §4)', () => {
    it('calculates the exact normative protocol budget of 3552 trajectories', () => {
      const pools = createDeterministicPools();
      const budget = calculateProtocolBudget(pools);
      expect(budget).toBe(3552);
      expect(PROTOCOL_BUDGET.total).toBe(3552);

      // Verify phase breakdown matches algorithm.md §4 exactly:
      expect(pools.baseline.size * 3).toBe(96);
      expect(8 * 24 * pools.train.size).toBe(1536);
      expect(8 * 2 * pools.selection.size).toBe(384);
      expect(pools.promotion.size * 2 * 8).toBe(1024);
      expect(pools.final.size * 4).toBe(512);
      expect(96 + 1536 + 384 + 1024 + 512).toBe(3552);
    });

    it('rejects budget calculations exceeding platform hard cap of 4096', () => {
      const oversizedPools: SeedPools = {
        baseline: { size: 32, runIndices: Array.from({ length: 32 }, (_, i) => i) },
        train: { size: 16, runIndices: Array.from({ length: 16 }, (_, i) => 100 + i) }, // doubled train: 8*24*16 = 3072
        selection: { size: 24, runIndices: Array.from({ length: 24 }, (_, i) => 200 + i) },
        promotion: { size: 64, runIndices: Array.from({ length: 64 }, (_, i) => 300 + i) },
        final: { size: 128, runIndices: Array.from({ length: 128 }, (_, i) => 400 + i) },
      };

      // 96 + 3072 + 384 + 1024 + 512 = 5088 > 4096
      expect(() => calculateProtocolBudget(oversizedPools)).toThrow('exceeds platform hard cap');
    });
  });

  describe('Policy Library Snapshot Constraints (algorithm.md §7, AC-15)', () => {
    const validEntry: PolicyLibraryEntry = {
      entryId: 'entry-01',
      weights: [0.5, -0.2, 0.1, -0.4],
      engineVersion: 'seir-v1',
      graphVersion: 'manta-v1',
      policyFamily: 'four-weight-linear-v1',
      horizonClass: 40,
      scoreHint: 45000,
      archivedAt: 1700000000,
    };

    it('accepts snapshots with <= 8 valid entries', () => {
      const snapshot = Array.from({ length: 8 }, (_, i) => ({
        ...validEntry,
        entryId: `entry-0${i + 1}`,
      }));
      expect(() => validateLibrarySnapshot(snapshot)).not.toThrow();
    });

    it('rejects snapshots with > 8 entries', () => {
      const snapshot = Array.from({ length: 9 }, (_, i) => ({
        ...validEntry,
        entryId: `entry-0${i + 1}`,
      }));
      expect(() => validateLibrarySnapshot(snapshot)).toThrow('exceeds maximum allowed entries (8)');
    });

    it('rejects snapshots with private leaks (owner, jobId, seeds)', () => {
      const contaminated1: any = [{ ...validEntry, owner: 'attacker' }];
      expect(() => validateLibrarySnapshot(contaminated1)).toThrow('forbidden private field');

      const contaminated2: any = [{ ...validEntry, jobId: 'job-123' }];
      expect(() => validateLibrarySnapshot(contaminated2)).toThrow('forbidden private field');

      const contaminated3: any = [{ ...validEntry, seeds: [1, 2, 3] }];
      expect(() => validateLibrarySnapshot(contaminated3)).toThrow('forbidden private field');
    });
  });

  describe('RunManifest Serialization & Integrity (AC-09, AC-16)', () => {
    it('creates, serializes and round-trip deserializes a complete RunManifest', () => {
      const manifest = createRunManifest({
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        scenarioHash: 'f4b3c2a1e0d9c8b7',
        baseSeed: 20261030,
        createdAt: '2026-10-28T01:00:00.000Z',
      });

      expect(manifest.jobId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(manifest.protocolBudget).toBe(3552);
      expect(manifest.versions).toEqual(DEFAULT_COMPATIBILITY_VERSIONS);

      const serialized = serializeRunManifest(manifest);
      const deserialized = deserializeRunManifest(serialized);

      expect(deserialized).toEqual(manifest);
    });

    it('produces identical SHA-256 hash for identical manifests regardless of key insertion order', () => {
      const m1 = createRunManifest({
        jobId: 'test-job',
        scenarioHash: 'hash-abc',
        baseSeed: 12345,
        createdAt: '2026-10-28T01:00:00.000Z',
      });

      const hash1 = computeManifestHash(m1);

      // Reconstruct with shuffled top-level keys
      const m2 = {
        createdAt: m1.createdAt,
        protocolBudget: m1.protocolBudget,
        scenarioHash: m1.scenarioHash,
        rngSeeds: m1.rngSeeds,
        jobId: m1.jobId,
        librarySnapshot: m1.librarySnapshot,
        versions: m1.versions,
        pools: m1.pools,
      };

      const hash2 = computeManifestHash(m2 as any);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex string
    });

    it('rejects deserialization of tampered manifest with budget mismatch', () => {
      const manifest = createRunManifest({
        jobId: 'job-tamper',
        scenarioHash: 'hash-1',
        baseSeed: 111,
      });

      const serialized = serializeRunManifest(manifest);
      const tampered = JSON.parse(serialized);
      tampered.protocolBudget = 4000; // Tamper declared budget

      expect(() => deserializeRunManifest(JSON.stringify(tampered))).toThrow('protocolBudget mismatch');
    });

    it('rejects deserialization of manifest with colliding pools', () => {
      const manifest = createRunManifest({
        jobId: 'job-collision',
        scenarioHash: 'hash-2',
        baseSeed: 222,
      });

      const serialized = serializeRunManifest(manifest);
      const tampered = JSON.parse(serialized);
      // Make train and baseline collide
      tampered.pools.train.runIndices[0] = tampered.pools.baseline.runIndices[0];

      expect(() => deserializeRunManifest(JSON.stringify(tampered))).toThrow(PoolCollisionError);
    });
  });
});
