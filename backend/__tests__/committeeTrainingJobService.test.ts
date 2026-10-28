import { describe, expect, test } from 'bun:test';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CommitteeAdmissionService } from '../committee/admissionService';
import { TrainingJobService } from '../committee/trainingJobService';
import { InvalidStateTransitionError, JobNotFoundError } from '../committee/types';
import { InMemoryDynamoDBClient } from './committee/inMemoryDynamoClient';

describe('TrainingJobService', () => {
  const ownerHash = 'training-owner-hash';
  const setup = () => {
    const admission = new CommitteeAdmissionService(new InMemoryDynamoDBClient() as unknown as DynamoDBClient, 'training-jobs');
    return { admission, jobs: new TrainingJobService(admission) };
  };

  test('claims once and advances persisted trajectory count by CAS only', async () => {
    const { admission, jobs } = setup();
    const admitted = await admission.admitJob({ ownerHash, idempotencyKey: 'training-cas-1', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 } });
    const stored = await admission.getJob(admitted.jobId, ownerHash);
    expect(stored?.resultPrefix).toBe(`committee/${ownerHash}/${admitted.jobId}/`);
    expect(stored?.manifestKey).toBe(`${stored?.resultPrefix}manifest.json`);
    expect((await jobs.claim(admitted.jobId)).stateRevision).toBe(2);
    await expect(jobs.claim(admitted.jobId)).rejects.toThrow(InvalidStateTransitionError);
    const advanced = await jobs.completeTrajectory(admitted.jobId, 0, 2);
    expect(advanced.stateRevision).toBe(3);
    expect((await admission.getJob(admitted.jobId))?.trainingCompletedTrajectories).toBe(1);
    await expect(jobs.completeTrajectory(admitted.jobId, 0, 2)).rejects.toThrow(InvalidStateTransitionError);
    await expect(jobs.completeTrajectory(admitted.jobId, 2, 3)).rejects.toThrow(InvalidStateTransitionError);
  });

  test('overdue running job is terminally reconciled on owner status read', async () => {
    const { admission, jobs } = setup();
    const admitted = await admission.admitJob({ ownerHash, idempotencyKey: 'training-cas-3', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 }, now: new Date('2026-01-01T00:00:00.000Z') });
    await jobs.claim(admitted.jobId);
    const status = await jobs.status(admitted.jobId, ownerHash, new Date('2026-01-01T00:11:00.000Z'));
    expect(status.status).toBe('timed-out');
    expect(status.finalAuditStatus).toBe('not-run');
  });

  test('foreign owner cannot inspect a training job; incomplete job cannot complete', async () => {
    const { admission, jobs } = setup();
    const admitted = await admission.admitJob({ ownerHash, idempotencyKey: 'training-cas-2', scenario: { scenarioKey: 'test', horizonDays: 20, seed: 42 } });
    await expect(jobs.status(admitted.jobId, 'other-owner')).rejects.toThrow(JobNotFoundError);
    await jobs.claim(admitted.jobId);
    await expect(jobs.terminalize(admitted.jobId, 'completed', 'passed', 2)).rejects.toThrow(InvalidStateTransitionError);
    expect((await admission.getJob(admitted.jobId))?.status).toBe('running');
  });
});
