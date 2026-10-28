import { describe, expect, test } from 'bun:test';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { EvaluationStore } from '../committee/evaluationStore';

function fakeS3() {
  const objects = new Map<string, string>();
  let failure: Error | undefined;
  return { objects, fail(error: Error) { failure = error; }, async send(command: any) {
    if (failure) throw failure;
    const { Key, Body, IfNoneMatch } = command.input;
    if (command instanceof PutObjectCommand) {
      if (IfNoneMatch === '*' && objects.has(Key)) throw Object.assign(new Error('exists'), { name: 'PreconditionFailed' });
      objects.set(Key, Body); return {};
    }
    if (command instanceof GetObjectCommand) {
      const body = objects.get(Key); if (body === undefined) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      return { Body: { transformToString: async () => body } };
    }
    throw new Error('Unexpected command');
  } };
}
const identity = { ownerHash: 'abc123', jobId: 'job-1', registryVersion: 'version-1', artifactHash: 'hash-1', scenarioHash: 'scenario-1' };
const pair = { completedPairs: 1, totalPairs: 2, runIndex: 42, candidate: 10, sgc: 12 };

describe('durable evaluation storage', () => {
  test('writes immutable compact pairs and accepts identical retries only', async () => {
    const client = fakeS3(); const store = new EvaluationStore(client as any, 'private');
    await store.putPair(identity, pair); await store.putPair(identity, pair);
    await store.putPair(identity, { sgc: 12, candidate: 10, runIndex: 42, totalPairs: 2, completedPairs: 1 });
    expect(await store.getPair(identity, 1)).toEqual(pair);
    await expect(store.putPair(identity, { ...pair, candidate: 11 })).rejects.toThrow('Conflicting');
    await expect(store.putPair({ ...identity, artifactHash: 'other' }, pair)).rejects.toThrow('Conflicting');
    expect(client.objects.size).toBe(1);
  });
  test('isolates owners and distinguishes missing objects from storage errors', async () => {
    const client = fakeS3(); const store = new EvaluationStore(client as any, 'private');
    await store.putPair(identity, pair);
    expect(await store.getPair({ ...identity, ownerHash: 'other' }, 1)).toBeNull();
    client.fail(Object.assign(new Error('denied'), { name: 'AccessDenied' }));
    await expect(store.getPair(identity, 1)).rejects.toThrow('denied');
    await expect(store.putPair(identity, pair)).rejects.toThrow('denied');
  });
  test('persists final report idempotently and prevents cross-job/path confusion', async () => {
    const client = fakeS3(); const store = new EvaluationStore(client as any, 'private');
    const report = { completedPairs: 2, totalPairs: 2, meanImprovement: 2 };
    await store.putReport(identity, report); await store.putReport(identity, report);
    await store.putReport(identity, { meanImprovement: 2, totalPairs: 2, completedPairs: 2 });
    expect(await store.getReport(identity)).toEqual(report);
    await expect(store.putReport(identity, { ...report, meanImprovement: 3 })).rejects.toThrow('Conflicting');
    await expect(store.getReport({ ...identity, jobId: '../other' })).rejects.toThrow('Invalid');
    await expect(store.putPair(identity, { ...pair, completedPairs: 3 })).rejects.toThrow('Invalid');
    await expect(store.putReport(identity, { ...report, completedPairs: 1 })).rejects.toThrow('Invalid');
  });
});
