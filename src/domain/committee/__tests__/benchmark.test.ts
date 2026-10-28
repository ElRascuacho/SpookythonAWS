import { describe, expect, test } from 'bun:test';
import { DEFAULT_SIMULATION_PARAMS } from '../../mantaGraph';
import { trainOffline } from '../offline';
import { benchmarkFrozenPolicy } from '../benchmark';

const artifact = trainOffline({
  jobId: 'benchmark-training', baseSeed: 12, horizonDays: 20,
  simulate: () => ({ totalCumulativeInfected: 100, timeline: [] }),
}).artifact;

const scenario = (id: string, seed: number, betaHuman = DEFAULT_SIMULATION_PARAMS.betaHuman) => ({
  id,
  params: { ...DEFAULT_SIMULATION_PARAMS, days: 20, seed, betaHuman, patientZeroIds: [...DEFAULT_SIMULATION_PARAMS.patientZeroIds] },
  runIndices: [1_000_000 + seed * 10, 1_000_001 + seed * 10],
});

describe('independent Committee benchmark', () => {
  test('uses frozen weights, fresh paired namespaces and equal scenario weighting', () => {
    const calls: Array<{ policy: string; runIndex: number; envNamespace: string; seed: number }> = [];
    const result = benchmarkFrozenPolicy({
      artifact,
      plan: { schemaVersion: 1, scenarios: [scenario('standard', 101), scenario('shifted', 102, DEFAULT_SIMULATION_PARAMS.betaHuman * 2)] },
      simulate: input => {
        calls.push({ policy: input.policy, runIndex: input.runIndex, envNamespace: input.envNamespace, seed: input.params.seed });
        const base = input.params.seed === 101 ? 100 : 200;
        const offset = input.policy === 'weighted' ? (input.params.seed === 101 ? -10 : 5) : input.policy === 'sgc' ? 0 : input.policy === 'random' ? 20 : 30;
        return { totalCumulativeInfected: base + offset + input.runIndex % 2, timeline: [] };
      },
    });
    expect(calls).toHaveLength(16);
    expect(new Set(calls.map(call => call.envNamespace))).toEqual(new Set(['committee-benchmark-env-v1']));
    expect(result.scenarios.map(row => row.meanImprovement)).toEqual([10, -5]);
    expect(result.scenarios.map(row => row.confidenceInterval)).toEqual([[10, 10], [-5, -5]]);
    expect(result.scenarios.map(row => row.degradationRate)).toEqual([0, 1]);
    expect(result.aggregate).toEqual({ weighting: 'equal-scenario', meanImprovement: 2.5, degradedScenarios: 1, worstScenarioImprovement: -5 });
    expect(result.manifest.artifactHash).toBe(artifact.artifactHash);
    expect(result.manifest.scenarios[0].runIndices).toEqual(scenario('standard', 101).runIndices);
    expect(artifact.weights).toEqual([0, 0, 0, 0]);
  });

  test('rejects reused training seed, duplicate indices, wrong horizon and artifact tampering before simulation', () => {
    let calls = 0;
    const simulate = () => { calls++; return { totalCumulativeInfected: 100, timeline: [] }; };
    const original = scenario('one', 101);
    expect(() => benchmarkFrozenPolicy({ artifact, plan: { schemaVersion: 1, scenarios: [scenario('same-seed', 12), original] }, simulate })).toThrow('fresh and distinct');
    expect(() => benchmarkFrozenPolicy({ artifact, plan: { schemaVersion: 1, scenarios: [original, { ...scenario('two', 102), runIndices: original.runIndices }] }, simulate })).toThrow('run indices must be fresh and distinct');
    expect(() => benchmarkFrozenPolicy({ artifact, plan: { schemaVersion: 1, scenarios: [{ ...original, params: { ...original.params, days: 40 } }, scenario('two', 102)] }, simulate })).toThrow('horizon incompatible');
    expect(() => benchmarkFrozenPolicy({ artifact, plan: { schemaVersion: 1, scenarios: [{ ...original, params: { ...original.params, betaHuman: -1 } }, scenario('two', 102)] }, simulate })).toThrow('Invalid benchmark scenario parameters');
    const altered = JSON.parse(JSON.stringify(artifact));
    altered.weights[0] = 2;
    expect(() => benchmarkFrozenPolicy({ artifact: altered, plan: { schemaVersion: 1, scenarios: [original, scenario('two', 102)] }, simulate })).toThrow('Artifact integrity mismatch');
    expect(calls).toBe(0);
  });

  test('is deterministic and does not make a positive claim for a worse policy', () => {
    const request = {
      artifact,
      plan: { schemaVersion: 1 as const, scenarios: [scenario('worse', 103), scenario('also-worse', 104)] },
      simulate: (input: { policy: string; runIndex: number }) => ({ totalCumulativeInfected: 100 + (input.policy === 'weighted' ? 5 : 0), timeline: [] }),
    };
    const first = benchmarkFrozenPolicy(request);
    expect(benchmarkFrozenPolicy(request)).toEqual(first);
    expect(first.scenarios[0].meanImprovement).toBe(-5);
    expect(first.scenarios[0].confidenceInterval).toEqual([-5, -5]);
    expect(first.scenarios[0].worstPairImprovement).toBe(-5);
  });
});
