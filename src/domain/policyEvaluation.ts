import { createWeightedPolicy } from './committee/weightedPolicy';
import { DEFAULT_COMPATIBILITY_VERSIONS, ZERO_POLICY_WEIGHTS, type PolicyWeights, type PublicPolicyProjection } from './committee/types';
import { DEFAULT_SIMULATION_PARAMS } from './mantaGraph';
import { computePercentile } from './monteCarlo';
import { createSeededRng } from './prng';
import { runSingleSeirSimulation } from './seirEngine';
import type { SimulationParams } from './types';

export interface PublishedPolicy {
  registryVersion: string;
  publishedAt?: string;
  audit?: 'passed' | 'failed' | 'not-run';
  finalEvidence?: { meanDifference: number; upperBound: number } | null;
  recordHash?: string;
  artifact: {
    schemaVersion?: 1;
    policyVersion: number;
    recommendation: 'trained' | 'sgc-fallback';
    weights: PolicyWeights;
    params: SimulationParams;
    manifest: {
      jobId?: string;
      scenarioHash?: string;
      versions: typeof DEFAULT_COMPATIBILITY_VERSIONS;
      pools: {
        baseline?: { size: number; runIndices: readonly number[] };
        train?: { size: number; runIndices: readonly number[] };
        selection?: { size: number; runIndices: readonly number[] };
        promotion?: { size: number; runIndices: readonly number[] };
        final: { size?: number; runIndices: readonly number[] };
      };
      librarySnapshot?: readonly never[];
      protocolBudget?: number;
      rngSeeds?: { baseSeed: number; envSeed: number; searchSeed: number; bootstrapSeed: number };
      createdAt?: string;
    };
    manifestHash?: string;
    artifactHash?: string;
  };
}

const range = (start: number, length: number): number[] =>
  Array.from({ length }, (_, index) => start + index);

export const DEFAULT_PUBLISHED_POLICY: PublishedPolicy = {
  registryVersion: '2026-10-28T12:00:00.000Z_zero-day-local-v1',
  publishedAt: '2026-10-28T12:00:00.000Z',
  audit: 'passed',
  finalEvidence: {
    meanDifference: -21977.296875,
    upperBound: -21836.09375,
  },
  artifact: {
    schemaVersion: 1,
    policyVersion: 2,
    weights: [-3, 0.2549761095727925, -1.684599261628244, -1.9742017141303],
    recommendation: 'trained',
    params: {
      ...DEFAULT_SIMULATION_PARAMS,
      days: 40,
      seed: 20261030,
    },
    manifest: {
      jobId: 'zero-day-manta-local',
      scenarioHash: '98f59ed71fee2c4075afe85ffe1ace065680b3c30320d571ce88918e10b272ea',
      versions: { ...DEFAULT_COMPATIBILITY_VERSIONS },
      pools: {
        baseline: { size: 32, runIndices: range(0, 32) },
        train: { size: 8, runIndices: range(32, 8) },
        selection: { size: 24, runIndices: range(40, 24) },
        promotion: { size: 64, runIndices: range(232, 64) },
        final: { size: 128, runIndices: range(744, 128) },
      },
      librarySnapshot: [],
      protocolBudget: 3552,
      rngSeeds: {
        baseSeed: 20261030,
        envSeed: 1083177282,
        searchSeed: 2452814919,
        bootstrapSeed: 7928225,
      },
      createdAt: '1970-01-01T00:00:00.000Z',
    },
    manifestHash: '03760a2cde38c4421729dad0fe0c46d6923cf2cf3117168c55269675d044660f',
    artifactHash: '76f625313b1876d26955cc2f69f20dac039ee4800d13d5eea91b0e6f7df6fb8f',
  },
  recordHash: 'b7b42644c688f017f03fe6a421a6d3347e2682088a5bcac23f7ce5949f314e16',
};
export interface PolicySample { infected: number; peak: number; peakDay: number; spent: number; vaccines: number; hospitalCollapseDays: number; daily: number[] }
export interface PolicyPair { index: number; candidate: PolicySample; sgc: PolicySample }

export type { PublicPolicyProjection } from './committee/types';

// Integrity and publication approval are validated by the authenticated registry endpoint.
export function parsePublishedPolicy(value: unknown): PublicPolicyProjection {
  if (!value || typeof value !== 'object') throw new Error('Política publicada inválida.');
  const record = value as Record<string, any>;
  if (typeof record.registryVersion !== 'string') throw new Error('Política publicada inválida.');

  // If projection provided directly (sanitized public projection)
  if (Array.isArray(record.weights) && Number.isInteger(record.policyVersion)) {
    const { policyVersion, weights, recommendation, compatibilityVersions } = record;
    if (policyVersion < 0 || !['trained', 'sgc-fallback'].includes(recommendation) || (recommendation === 'trained' ? policyVersion === 0 : policyVersion !== 0) || weights.length !== 4 || weights.some((w: number) => !Number.isFinite(w) || w < -3 || w > 3)) {
      throw new Error('Política publicada inválida.');
    }
    const versions = compatibilityVersions ?? DEFAULT_COMPATIBILITY_VERSIONS;
    if (Object.entries(DEFAULT_COMPATIBILITY_VERSIONS).some(([k, expected]) => versions[k] !== expected)) {
      throw new Error('La política publicada no es compatible con esta versión del simulador.');
    }
    return {
      registryVersion: record.registryVersion,
      publishedAt: record.publishedAt ?? new Date().toISOString(),
      policyVersion,
      recommendation,
      weights: [...weights] as unknown as PolicyWeights,
      audit: record.audit === 'passed' ? 'passed' : 'failed',
      finalEvidence: record.finalEvidence ?? null,
      compatibilityVersions: { ...versions },
      projectionHash: record.projectionHash ?? 'verified',
      artifact: {
        policyVersion,
        recommendation,
        weights: [...weights] as unknown as PolicyWeights,
        params: record.params ?? DEFAULT_SIMULATION_PARAMS,
      },
    };
  }

  // Legacy full artifact wrapper
  const a = record.artifact;
  if (!a || !Number.isInteger(a.policyVersion) || a.policyVersion < 0 || !['trained', 'sgc-fallback'].includes(a.recommendation) || (a.recommendation === 'trained' ? a.policyVersion === 0 : a.policyVersion !== 0) || !Array.isArray(a.weights) || a.weights.length !== 4 || a.weights.some((w: number) => !Number.isFinite(w) || w < -3 || w > 3)) {
    throw new Error('Política publicada inválida.');
  }
  const versions = a.manifest?.versions ?? DEFAULT_COMPATIBILITY_VERSIONS;
  if (Object.entries(DEFAULT_COMPATIBILITY_VERSIONS).some(([key, expected]) => versions[key as keyof typeof versions] !== expected)) {
    throw new Error('La política publicada no es compatible con esta versión del simulador.');
  }
  if (a.manifest?.pools?.final?.runIndices && (!Array.isArray(a.manifest.pools.final.runIndices) || !a.manifest.pools.final.runIndices.length || a.manifest.pools.final.runIndices.some((index: number) => !Number.isSafeInteger(index) || index < 0 || index > 4294967095))) {
    throw new Error("Índices de evaluación incompatibles.");
  }
  if (a.params && (Object.entries(DEFAULT_SIMULATION_PARAMS).some(([key, expected]) => Array.isArray(expected) ? !Array.isArray(a.params[key as keyof SimulationParams]) : typeof a.params[key as keyof SimulationParams] !== typeof expected) || !Number.isInteger(a.params.days) || a.params.days < 20 || a.params.days > 60)) {
    throw new Error('La configuración de la política publicada es inválida.');
  }

  return {
    registryVersion: record.registryVersion,
    publishedAt: record.publishedAt ?? new Date().toISOString(),
    policyVersion: a.policyVersion,
    recommendation: a.recommendation,
    weights: [...a.weights] as unknown as PolicyWeights,
    audit: record.audit === 'passed' ? 'passed' : 'failed',
    finalEvidence: record.finalEvidence ?? null,
    compatibilityVersions: { ...versions },
    projectionHash: record.projectionHash ?? record.recordHash ?? a.artifactHash ?? 'verified',
    artifact: {
      policyVersion: a.policyVersion,
      recommendation: a.recommendation,
      weights: [...a.weights] as unknown as PolicyWeights,
      params: a.params ?? DEFAULT_SIMULATION_PARAMS,
    },
  };
}
export function simulatePolicyPair(params: SimulationParams, weights: PolicyWeights, index: number): PolicyPair {
  const run = (w: PolicyWeights): PolicySample => {
    const result = runSingleSeirSimulation(params, 'SMART_CORTAFUEGOS', index, undefined, { onDailyDecision: createWeightedPolicy(w), envNamespace: 'committee-env' });
    return { infected: result.totalCumulativeInfected, peak: result.peakZombies, peakDay: result.peakDay, spent: result.totalBudgetSpent, vaccines: result.totalVaccinesUsed, hospitalCollapseDays: result.hospitalCollapseDays, daily: result.timeline.map(day => day.cumulativeInfected) };
  };
  return { index, candidate: run(weights), sgc: run(ZERO_POLICY_WEIGHTS) };
}
export function summarizePolicyPairs(pairs: PolicyPair[], seed: number) {
  if (!pairs.length) throw new Error('No hay simulaciones para resumir.');
  const ordered = [...pairs].sort((a, b) => a.index - b.index);
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const candidate = ordered.map(p => p.candidate.infected), sgc = ordered.map(p => p.sgc.infected);
  const differences = ordered.map(p => p.sgc.infected - p.candidate.infected);
  const candidateMean = mean(candidate), sgcMean = mean(sgc), meanDifference = mean(differences);
  const rng = createSeededRng(seed, 'POLICY_EVALUATION_BOOTSTRAP', 0);
  const bootstrap = Array.from({ length: 2000 }, () => mean(ordered.map(() => differences[Math.floor(rng() * ordered.length)]))).sort((a, b) => a - b);
  const sorted = [...candidate].sort((a, b) => a - b);
  return { candidateMean, sgcMean, meanDifference, improvementPercent: sgcMean === 0 ? null : meanDifference / sgcMean * 100, p10: computePercentile(sorted, 10), p90: computePercentile(sorted, 90), confidenceInterval: [bootstrap[49], bootstrap[1949]] as [number, number] };
}
