import { describe, expect, test } from 'bun:test';
import { trainOffline } from '../../src/domain/committee/offline';
import { evaluateRegisteredPolicy } from '../committee/evaluation';

const training = trainOffline({ jobId: 'evaluation-test', baseSeed: 5, horizonDays: 40, simulate: () => ({ totalCumulativeInfected: 100, timeline: [] }) });
const record = { registryVersion: 'version-1', artifact: training.artifact } as any;
const registry = { get: async () => record } as any;
describe('server policy evaluation', () => {
  test('evaluates a frozen registered policy with paired seeds and compact outcomes', async () => {
    const inputs: any[] = [];
    const report = await evaluateRegisteredPolicy(registry, { registryVersion: 'version-1', seed: 42 }, input => {
      inputs.push(input); return { totalCumulativeInfected: input.runIndex, timeline: [] };
    });
    expect(report.registryVersion).toBe('version-1');
    expect(report.runs).toHaveLength(128);
    expect(report.trajectories).toBe(256);
    expect(report.meanImprovement).toBe(0);
    expect(inputs).toHaveLength(256);
    expect(inputs.every(input => input.phase === 'evaluation' && input.params.seed === 42 && input.params.days === 40)).toBe(true);
    expect(report.runs[0]).toEqual({ runIndex: inputs[0].runIndex, candidate: inputs[0].runIndex, sgc: inputs[0].runIndex });
    expect(report.runs[0].runIndex).toBe(inputs[1].runIndex);
  });
  test('rejects mismatched horizon, invalid seed, and absent version', async () => {
    await expect(evaluateRegisteredPolicy(registry, { registryVersion: 'version-1', seed: 42, horizonDays: 20 })).rejects.toThrow('horizon');
    await expect(evaluateRegisteredPolicy(registry, { registryVersion: 'version-1', seed: -1 })).rejects.toThrow('seed');
    await expect(evaluateRegisteredPolicy({ get: async () => null } as any, { registryVersion: 'version-1', seed: 42 })).rejects.toThrow('not found');
  });
});
