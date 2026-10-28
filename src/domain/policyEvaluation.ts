import { createWeightedPolicy } from './committee/weightedPolicy';
import { DEFAULT_COMPATIBILITY_VERSIONS, ZERO_POLICY_WEIGHTS, type PolicyWeights } from './committee/types';
import { DEFAULT_SIMULATION_PARAMS } from './mantaGraph';
import { computePercentile } from './monteCarlo';
import { createSeededRng } from './prng';
import { runSingleSeirSimulation } from './seirEngine';
import type { SimulationParams } from './types';

export interface PublishedPolicy {
  registryVersion: string;
  artifact: { policyVersion: number; recommendation: 'trained' | 'sgc-fallback'; weights: PolicyWeights; params: SimulationParams; manifest: { versions: typeof DEFAULT_COMPATIBILITY_VERSIONS; pools: { final: { runIndices: readonly number[] } } } };
}
export interface PolicySample { infected: number; peak: number; peakDay: number; spent: number; vaccines: number; hospitalCollapseDays: number; daily: number[] }
export interface PolicyPair { index: number; candidate: PolicySample; sgc: PolicySample }

// Integrity and publication approval are validated by the authenticated registry endpoint.
export function parsePublishedPolicy(value: unknown): PublishedPolicy {
  const record = value as PublishedPolicy;
  const a = record?.artifact;
  if (!record || typeof record.registryVersion !== 'string' || !a || !Number.isInteger(a.policyVersion) || a.policyVersion < 0 || !['trained', 'sgc-fallback'].includes(a.recommendation) || (a.recommendation === 'trained' ? a.policyVersion === 0 : a.policyVersion !== 0) || !Array.isArray(a.weights) || a.weights.length !== 4 || a.weights.some(w => !Number.isFinite(w) || w < -3 || w > 3)) throw new Error('Política publicada inválida.');
  const versions = a.manifest?.versions;
  if (!versions || Object.entries(DEFAULT_COMPATIBILITY_VERSIONS).some(([key, expected]) => versions[key as keyof typeof versions] !== expected)) throw new Error('La política publicada no es compatible con esta versión del simulador.');
  if (!Array.isArray(a.manifest.pools?.final?.runIndices) || !a.manifest.pools.final.runIndices.length || a.manifest.pools.final.runIndices.some(index => !Number.isSafeInteger(index) || index < 0 || index > 4294967095)) throw new Error("Índices de evaluación incompatibles.");
  if (!a.params || Object.entries(DEFAULT_SIMULATION_PARAMS).some(([key, expected]) => Array.isArray(expected) ? !Array.isArray(a.params[key as keyof SimulationParams]) : typeof a.params[key as keyof SimulationParams] !== typeof expected) || !Number.isInteger(a.params.days) || a.params.days < 20 || a.params.days > 60) throw new Error('La configuración de la política publicada es inválida.');
  return record;
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
