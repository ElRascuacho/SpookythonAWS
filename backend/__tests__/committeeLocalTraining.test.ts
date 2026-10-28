import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trainOffline } from '../../src/domain/committee/offline';
import { parseTrainingArgs, runLocalTraining } from '../../scripts/train-committee';

describe('local committee operator training', () => {
  test('validates explicit bounded inputs before executing', () => {
    expect(parseTrainingArgs(['--output', 'policy.json', '--seed', '42', '--days', '40'])).toEqual({ output: 'policy.json', baseSeed: 42, horizonDays: 40 });
    for (const args of [[], ['--output', 'x', '--seed', '-1'], ['--output', 'x', '--days', '61'], ['--output', 'x', '--days', '20.5'], ['--output', 'x', '--unknown', 'a']]) {
      expect(() => parseTrainingArgs(args)).toThrow();
    }
  });
  test('writes complete evidence and compact trajectory ledger exclusively', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'committee-training-'));
    const output = join(directory, 'result.json');
    try {
      const training = (request: Parameters<typeof trainOffline>[0]) => trainOffline({ ...request, simulate: ({ policy }) => ({ totalCumulativeInfected: policy === 'weighted' ? 90 : 100, timeline: [] }) });
      const result = await runLocalTraining({ output, baseSeed: 42, horizonDays: 20 }, training);
      const stored = JSON.parse(await readFile(output, 'utf8'));
      expect(result.trajectories).toBe(3552);
      expect(stored.trajectories).toBe(3552);
      expect(stored.ledger).toHaveLength(3552);
      expect(stored.ledger[0].timeline).toBeUndefined();
      expect(stored.audit).toBe(result.audit);
      expect(stored.artifact.artifactHash).toBe(result.artifact.artifactHash);
      expect(stored.published).toBe(false);
      await expect(runLocalTraining({ output, baseSeed: 42, horizonDays: 20 }, training)).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  test('does not write incomplete training output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'committee-training-'));
    const output = join(directory, 'incomplete.json');
    try {
      const incomplete = (() => ({ trajectories: 0, ledger: [], audit: 'not-run' })) as unknown as typeof trainOffline;
      await expect(runLocalTraining({ output, baseSeed: 42, horizonDays: 20 }, incomplete)).rejects.toThrow('Incomplete');
      await expect(readFile(output)).rejects.toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
