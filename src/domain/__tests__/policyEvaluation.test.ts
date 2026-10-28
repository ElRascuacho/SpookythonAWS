import { describe, expect, test } from 'bun:test';
import { DEFAULT_SIMULATION_PARAMS } from '../mantaGraph';
import { DEFAULT_COMPATIBILITY_VERSIONS } from '../committee/types';
import { DEFAULT_PUBLISHED_POLICY, parsePublishedPolicy, simulatePolicyPair, summarizePolicyPairs } from '../policyEvaluation';

describe('frozen policy evaluation', () => {
  test('zero weights match SGC in each reproducible paired environment', () => {
    const params = { ...DEFAULT_SIMULATION_PARAMS, days: 3, seed: 42 };
    const pair = simulatePolicyPair(params, [0, 0, 0, 0], 5);
    expect(pair.candidate).toEqual(pair.sgc);
    simulatePolicyPair(params, [1, 0, 0, 0], 2);
    expect(simulatePolicyPair(params, [0, 0, 0, 0], 5)).toEqual(pair);
  });
  test('reports signed change and handles zero baseline', () => {
    const sample = (infected: number) => ({ infected, peak: 1, peakDay: 0, spent: 0, vaccines: 0, hospitalCollapseDays: 0, daily: [infected] });
    const pairs = [{ index: 0, candidate: sample(20), sgc: sample(10) }, { index: 1, candidate: sample(20), sgc: sample(10) }];
    const summary = summarizePolicyPairs(pairs, 1);
    expect(summary.improvementPercent).toBe(-100);
    expect(summary.confidenceInterval).toEqual([-10, -10]);
    expect(summarizePolicyPairs([...pairs].reverse(), 1)).toEqual(summary);
    expect(summarizePolicyPairs([{ index: 0, candidate: sample(0), sgc: sample(0) }], 1).improvementPercent).toBeNull();
  });
  test('rejects incompatible policy metadata', () => {
    const artifact = { policyVersion: 1, recommendation: 'trained', weights: [0, 0, 0, 0], params: { ...DEFAULT_SIMULATION_PARAMS, days: 40 }, manifest: { versions: DEFAULT_COMPATIBILITY_VERSIONS, pools: { final: { runIndices: [871] } } } };
    expect(parsePublishedPolicy({ registryVersion: 'one', artifact }).artifact.policyVersion).toBe(1);
    expect(() => parsePublishedPolicy({ registryVersion: 'one', artifact: { ...artifact, manifest: { ...artifact.manifest, versions: { ...DEFAULT_COMPATIBILITY_VERSIONS, graphVersion: 'other' } } } })).toThrow();
    expect(() => parsePublishedPolicy({ registryVersion: 'one', artifact: { ...artifact, weights: [9, 0, 0, 0] } })).toThrow();
  });
  test('validates canonical default published policy and runs paired simulation', () => {
    const parsed = parsePublishedPolicy(DEFAULT_PUBLISHED_POLICY);
    expect(parsed.artifact.recommendation).toBe('trained');
    expect(parsed.artifact.policyVersion).toBe(2);
    const pair = simulatePolicyPair(parsed.artifact.params, parsed.artifact.weights, 872);
    expect(pair.candidate.infected).toBeLessThan(pair.sgc.infected);
  });
});
