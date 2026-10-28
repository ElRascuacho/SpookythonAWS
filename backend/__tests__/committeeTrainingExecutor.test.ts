import { describe, expect, test } from 'bun:test';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CommitteeAdmissionService } from '../committee/admissionService';
import { TrainingJobService } from '../committee/trainingJobService';
import { TrainingExecutor } from '../committee/trainingExecutor';
import { InMemoryDynamoDBClient } from './committee/inMemoryDynamoClient';
import { trainOfflineSequential } from '../../src/domain/committee/offline';

const ownerHash = 'training-executor-owner';
const simulate = ({ policy, weights }: { policy: string; weights: readonly number[] }) => ({
  totalCumulativeInfected: policy === 'weighted' ? 100 - weights[0] * 10 : 120,
  timeline: [],
});

function setup(options: { simulate?: typeof simulate; now?: () => number; run?: typeof trainOfflineSequential } = {}) {
  const admission = new CommitteeAdmissionService(new InMemoryDynamoDBClient() as unknown as DynamoDBClient, 'training-executor-table');
  const jobs = new TrainingJobService(admission);
  const records: unknown[] = [];
  let finalized = 0;
  let artifacts = 0;
  const store = {
    putManifest: async () => {},
    putTrajectory: async (_identity: unknown, progress: unknown) => { records.push(progress); },
    finalize: async (_identity: unknown, _input: unknown, expected: readonly unknown[]) => {
      expect(expected).toHaveLength(3552);
      finalized++;
      return { trajectoryCount: expected.length, ledgerHash: 'verified' };
    },
    putArtifact: async (identity: { ownerHash: string; jobId: string }, artifact: { artifactHash: string }) => {
      artifacts++;
      return { key: `committee/${identity.ownerHash}/${identity.jobId}/artifact.json`, artifactHash: artifact.artifactHash };
    },
  };
  const executor = new TrainingExecutor({ admission, jobs, store: store as any, simulate: (options.simulate ?? simulate) as any, now: options.now, run: options.run } as any);
  return { admission, jobs, records, store, executor, get finalized() { return finalized; }, get artifacts() { return artifacts; } };
}

describe('TrainingExecutor', () => {
  test('claims and persists every trajectory before completing; duplicate delivery is inert', async () => {
    const context = setup();
    const admitted = await context.admission.admitJob({ ownerHash, idempotencyKey: 'training-executor-1', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 } });
    const outcome = await context.executor.execute(admitted.jobId, ownerHash);
    expect(outcome.status).toBe('completed');
    expect(context.records).toHaveLength(3552);
    expect(context.finalized).toBe(1);
    expect(context.artifacts).toBe(1);
    const terminal = await context.admission.getJob(admitted.jobId, ownerHash);
    expect(terminal?.trainingArtifactKey).toBe(`committee/${ownerHash}/${admitted.jobId}/artifact.json`);
    expect(terminal?.trainingArtifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await context.admission.getJob(admitted.jobId))?.trainingCompletedTrajectories).toBe(3552);
    expect((await context.admission.getJob(admitted.jobId))?.finalAuditStatus).toBe('passed');
    expect(await context.executor.execute(admitted.jobId, ownerHash)).toEqual(outcome);
    expect(context.finalized).toBe(1);
    expect(context.artifacts).toBe(1);
  });

  test('cancellation after persistence never finalizes evidence or publishes', async () => {
    const context = setup();
    const admitted = await context.admission.admitJob({ ownerHash, idempotencyKey: 'training-executor-2', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 } });
    const original = context.store.putTrajectory;
    context.store.putTrajectory = async (identity: unknown, progress: unknown) => {
      await original(identity, progress);
      if (context.records.length === 1) await context.admission.requestCancel(admitted.jobId, ownerHash);
    };
    const outcome = await context.executor.execute(admitted.jobId, ownerHash);
    expect(outcome.status).toBe('cancelled');
    expect(context.finalized).toBe(0);
    expect(context.artifacts).toBe(0);
    expect((await context.admission.getJob(admitted.jobId))?.status).toBe('cancelled');
  });

  test('store failure terminalizes as failed and cannot publish', async () => {
    const context = setup();
    const admitted = await context.admission.admitJob({ ownerHash, idempotencyKey: 'training-executor-3', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 } });
    context.store.putTrajectory = async () => { throw new Error('storage unavailable'); };
    await expect(context.executor.execute(admitted.jobId, ownerHash)).rejects.toThrow('storage unavailable');
    expect((await context.admission.getJob(admitted.jobId))?.status).toBe('failed');
    expect(context.finalized).toBe(0);
  });

  test('no improvement keeps the baseline and never reports an approved policy', async () => {
    const context = setup({ simulate: () => ({ totalCumulativeInfected: 100, timeline: [] }) });
    const admitted = await context.admission.admitJob({ ownerHash, idempotencyKey: 'training-executor-4', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 } });
    const outcome = await context.executor.execute(admitted.jobId, ownerHash);
    expect(outcome.status).toBe('no-improvement');
    expect((await context.admission.getJob(admitted.jobId))?.finalAuditStatus).toBe('failed');
    expect(context.finalized).toBe(1);
    expect(context.artifacts).toBe(1);
    expect((await context.admission.getJob(admitted.jobId))?.trainingArtifactKey).toContain('/artifact.json');
  });

  test('artifact persistence failure cannot mark training complete', async () => {
    const context = setup();
    const admitted = await context.admission.admitJob({ ownerHash, idempotencyKey: 'training-executor-artifact-fail', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 } });
    context.store.putArtifact = async () => { throw new Error('artifact unavailable'); };
    await expect(context.executor.execute(admitted.jobId, ownerHash)).rejects.toThrow('artifact unavailable');
    const job = await context.admission.getJob(admitted.jobId);
    expect(job?.status).toBe('failed');
    expect(job?.trainingArtifactKey).toBeUndefined();
  });

  test('deadline prevents simulations and final evidence', async () => {
    const context = setup({ now: () => Date.now() + 1_000_000 });
    const admitted = await context.admission.admitJob({ ownerHash, idempotencyKey: 'training-executor-5', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 } });
    const outcome = await context.executor.execute(admitted.jobId, ownerHash);
    expect(outcome.status).toBe('timed-out');
    expect(context.records).toHaveLength(0);
    expect(context.finalized).toBe(0);
  });

  test('a tampered final statistic fails closed before writing final audit', async () => {
    const context = setup({ run: async request => {
      const result = await trainOfflineSequential(request);
      if (result.status !== 'completed') return result;
      return { ...result, result: { ...result.result, finalEvidence: { meanDifference: 999, upperBound: 999 } } };
    } });
    const admitted = await context.admission.admitJob({ ownerHash, idempotencyKey: 'training-executor-6', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 } });
    await expect(context.executor.execute(admitted.jobId, ownerHash)).rejects.toThrow('statistical evidence mismatch');
    expect((await context.admission.getJob(admitted.jobId))?.status).toBe('failed');
    expect(context.finalized).toBe(0);
  });

  test('a tampered trajectory namespace fails replay before final audit', async () => {
    const context = setup({ run: async request => {
      const result = await trainOfflineSequential(request);
      if (result.status !== 'completed') return result;
      const ledger = [...result.result.ledger];
      ledger[0] = { ...ledger[0], envNamespace: 'wrong-environment' };
      return { ...result, result: { ...result.result, ledger } };
    } });
    const admitted = await context.admission.admitJob({ ownerHash, idempotencyKey: 'training-executor-7', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 } });
    await expect(context.executor.execute(admitted.jobId, ownerHash)).rejects.toThrow('statistical evidence mismatch');
    expect(context.finalized).toBe(0);
  });

  test('invalid admitted scenario fails terminally after claim', async () => {
    const context = setup();
    const admitted = await context.admission.admitJob({ ownerHash, idempotencyKey: 'training-executor-8', scenario: { scenarioKey: 'test', horizonDays: 20, seed: -1 } });
    await expect(context.executor.execute(admitted.jobId, ownerHash)).rejects.toThrow('Invalid training scenario');
    expect((await context.admission.getJob(admitted.jobId))?.status).toBe('failed');
  });

  test('publishes to registry when training passes audit and registry is provided', async () => {
    const publishedList: any[] = [];
    const registry = {
      publish: async (result: any, now: Date) => {
        publishedList.push({ result, now });
        return { registryVersion: '2026-10-28T12:00:00.000Z_v1-abc' };
      },
    };
    const context = setup();
    const executorWithRegistry = new TrainingExecutor({
      ...context,
      admission: context.admission,
      jobs: context.jobs,
      store: context.store as any,
      registry: registry as any,
      simulate,
    });
    const admitted = await context.admission.admitJob({ ownerHash, idempotencyKey: 'training-executor-reg-1', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 } });
    const outcome = await executorWithRegistry.execute(admitted.jobId, ownerHash);
    expect(outcome.status).toBe('completed');
    expect(publishedList).toHaveLength(1);
    expect(publishedList[0].result.audit).toBe('passed');

    // Duplicate delivery is inert and does not re-publish
    await executorWithRegistry.execute(admitted.jobId, ownerHash);
    expect(publishedList).toHaveLength(1);
  });
});
