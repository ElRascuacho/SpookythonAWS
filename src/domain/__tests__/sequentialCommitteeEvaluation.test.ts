import { describe, expect, test } from 'bun:test';
import { evaluateFrozenPolicy, evaluateFrozenPolicySequential, trainOffline } from '../committee/offline';

const artifact = trainOffline({ jobId: 'sequential', baseSeed: 42, horizonDays: 20, simulate: () => ({ totalCumulativeInfected: 100, timeline: [] }) }).artifact;
const output = (input: any) => ({ totalCumulativeInfected: input.runIndex + (input.policy === 'sgc' ? 3 : 0), timeline: [] });
const request = { artifact, policyVersion: artifact.policyVersion, baseSeed: 7, pairs: 3, simulate: output };

describe('sequential frozen evaluation', () => {
  test('awaits each persistence callback between paired runs and matches the synchronous summary', async () => {
    const events: string[] = [];
    const result = await evaluateFrozenPolicySequential({ ...request,
      simulate: input => { events.push(`${input.policy}:${input.runIndex}`); return output(input); },
      shouldCancel: async () => { events.push('check'); return false; },
      persistPair: async ({ completedPairs, run }) => { events.push(`persist-start:${completedPairs}:${run.runIndex}`); await Promise.resolve(); events.push(`persist-end:${completedPairs}:${run.runIndex}`); },
    });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('Expected completed result');
    expect(result.summary).toEqual(evaluateFrozenPolicy(request));
    const start = result.summary.runs[0].runIndex;
    expect(events).toEqual(Array.from({ length: 3 }, (_, i) => ['check', `weighted:${start + i}`, `sgc:${start + i}`, `persist-start:${i + 1}:${start + i}`, `persist-end:${i + 1}:${start + i}`]).flat());
  });

  test('cancels before the next pair without producing a final confidence interval', async () => {
    let cancelled = false;
    const calls: string[] = [];
    const result = await evaluateFrozenPolicySequential({ ...request,
      simulate: input => { calls.push(input.policy); return output(input); },
      shouldCancel: async () => cancelled,
      persistPair: async () => { cancelled = true; },
    });
    expect(calls).toEqual(['weighted', 'sgc']);
    expect(result.status).toBe('cancelled');
    if (result.status !== 'cancelled') throw new Error('Expected cancellation');
    expect(result.completedPairs).toBe(1);
    expect(result.totalPairs).toBe(3);
    expect(result.runs).toHaveLength(1);
    expect(result).not.toHaveProperty('summary');
    expect(result).not.toHaveProperty('confidenceInterval');
  });

  test('cancels before any simulation or persistence when requested initially', async () => {
    let calls = 0;
    const result = await evaluateFrozenPolicySequential({ ...request,
      simulate: input => { calls++; return output(input); },
      shouldCancel: async () => true,
      persistPair: async () => { calls++; },
    });
    expect(result).toEqual({ status: 'cancelled', completedPairs: 0, totalPairs: 3, runs: [] });
    expect(calls).toBe(0);
  });

  test('isolates the summary and subsequent simulation from callback mutation', async () => {
    const copiedArtifact = JSON.parse(JSON.stringify(artifact));
    const mutableRequest = { ...request, artifact: copiedArtifact };
    const expected = evaluateFrozenPolicy(mutableRequest);
    const result = await evaluateFrozenPolicySequential({ ...mutableRequest,
      shouldCancel: async () => false,
      persistPair: async ({ run }) => { run.candidate.totalCumulativeInfected = -100; copiedArtifact.manifest.rngSeeds.bootstrapSeed = 999; },
    });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.summary).toEqual(expected);
  });

  test('propagates persistence, cancellation and simulation errors and validates artifact integrity', async () => {
    const fail = new Error('failed');
    await expect(evaluateFrozenPolicySequential({ ...request, shouldCancel: async () => false, persistPair: async () => { throw fail; } })).rejects.toBe(fail);
    await expect(evaluateFrozenPolicySequential({ ...request, shouldCancel: async () => { throw fail; }, persistPair: async () => {} })).rejects.toBe(fail);
    await expect(evaluateFrozenPolicySequential({ ...request, simulate: () => { throw fail; }, shouldCancel: async () => false, persistPair: async () => {} })).rejects.toBe(fail);
    const tampered = JSON.parse(JSON.stringify(artifact)); tampered.weights[0] = 2;
    await expect(evaluateFrozenPolicySequential({ ...request, artifact: tampered, shouldCancel: async () => false, persistPair: async () => {} })).rejects.toThrow('Artifact integrity mismatch');
  });
});
