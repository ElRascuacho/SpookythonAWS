/**
 * Deterministic 32-bit PRNG (Mulberry32) and fast binomial sampler.
 * Ensures 100% reproducibility across browser and AWS Lambda for identical (seed, strategy, runIndex).
 */

export type RngFunction = () => number;

/**
 * Mixes integer inputs into a well-distributed 32-bit unsigned seed (MurmurHash3 avalanche).
 */
export function hashSeed(seed: number, scenarioCode: number, runIndex: number, extra: number = 0): number {
  let h = (seed ^ 0xdeadbeef) >>> 0;
  h = Math.imul(h ^ (scenarioCode >>> 0), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (runIndex >>> 0), 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ (extra >>> 0), 0x27d4eb2f) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Mulberry32 deterministic PRNG returning floats in [0, 1).
 */
export function mulberry32(initialSeed: number): RngFunction {
  let state = initialSeed >>> 0;
  return function nextFloat(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a deterministic RNG for a given base seed, scenario/strategy identifier, and Monte Carlo run index.
 */
export function createSeededRng(seed: number, scenarioId: string, runIndex: number): RngFunction {
  let scenarioHash = 2166136261 >>> 0;
  for (let i = 0; i < scenarioId.length; i++) {
    scenarioHash ^= scenarioId.charCodeAt(i);
    scenarioHash = Math.imul(scenarioHash, 16777619) >>> 0;
  }
  const combinedSeed = hashSeed(seed, scenarioHash, runIndex);
  return mulberry32(combinedSeed);
}

/**
 * Box-Muller standard normal sample using deterministic RNG.
 */
export function sampleStandardNormal(rng: RngFunction): number {
  let u1 = rng();
  const u2 = rng();
  if (u1 < 1e-12) u1 = 1e-12;
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Deterministic Binomial(n, p) sampler.
 * Uses exact Bernoulli trials for small n * p or small n, and truncated Gaussian approximation with continuity correction for large n.
 */
export function sampleBinomial(n: number, p: number, rng: RngFunction): number {
  const count = Math.floor(n);
  if (count <= 0 || p <= 0) return 0;
  if (p >= 1) return count;

  // Exact Bernoulli sum for small counts
  if (count <= 45) {
    let successes = 0;
    for (let i = 0; i < count; i++) {
      if (rng() < p) successes++;
    }
    return successes;
  }

  const mean = count * p;
  const variance = count * p * (1 - p);

  // If mean is very small, use exact Bernoulli or Poisson-like trials
  if (mean < 8) {
    let successes = 0;
    for (let i = 0; i < count; i++) {
      if (rng() < p) successes++;
    }
    return successes;
  }

  // Normal approximation with continuity correction and clamping to [0, count]
  const stdDev = Math.sqrt(variance);
  const z = sampleStandardNormal(rng);
  const sampled = Math.round(mean + stdDev * z);
  if (sampled < 0) return 0;
  if (sampled > count) return count;
  return sampled;
}
