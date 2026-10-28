import { createHash } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createRunManifest, computeManifestHash } from '../../src/domain/committee/manifest';
import { TrainingEvidenceStore } from '../committee/trainingEvidenceStore';
import type { PolicyArtifact } from '../../src/domain/committee/offline';

function fakeS3() {
  const objects = new Map<string, string>();
  return { objects, async send(command: any) {
    const { Key, Body, IfNoneMatch } = command.input;
    if (command instanceof PutObjectCommand) {
      if (IfNoneMatch !== '*') throw new Error('Mutable write');
      if (objects.has(Key)) throw Object.assign(new Error('exists'), { name: 'PreconditionFailed' });
      objects.set(Key, Body); return {};
    }
    if (command instanceof GetObjectCommand) {
      const body = objects.get(Key);
      if (body === undefined) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      return { Body: { transformToString: async () => body } };
    }
    throw new Error('Unexpected command');
  } };
}

const manifest = createRunManifest({ jobId: 'job-1', scenarioHash: 'scenario-1', baseSeed: 42, createdAt: '2026-01-01T00:00:00.000Z' });
const identity = {
  ownerHash: 'owner-1', jobId: manifest.jobId, scenarioHash: manifest.scenarioHash,
  manifestHash: computeManifestHash(manifest), versions: manifest.versions,
};
const record = (index: number) => ({
  phase: 'training' as const, policy: 'weighted' as const, policyId: 'weighted:[0,0,0,0]',
  envNamespace: 'committee-env', runIndex: index, outcome: index,
});

describe('private immutable training evidence', () => {
  test('requires the manifest first and accepts canonical identical trajectory retries', async () => {
    const client = fakeS3(); const store = new TrainingEvidenceStore(client as any, 'private');
    await expect(store.putTrajectory(identity, { completedTrajectories: 1, totalTrajectories: manifest.protocolBudget, record: record(1) })).rejects.toThrow('manifest');
    await store.putManifest(identity, manifest);
    await store.putManifest(identity, manifest);
    await store.putManifest(identity, Object.fromEntries(Object.entries(manifest).reverse()) as typeof manifest);
    const progress = { completedTrajectories: 1, totalTrajectories: manifest.protocolBudget, record: record(1) };
    await store.putTrajectory(identity, progress);
    expect(await store.getTrajectory(identity, 1)).toEqual(progress);
    await store.putTrajectory(identity, { record: { outcome: 1, runIndex: 1, envNamespace: 'committee-env', policyId: 'weighted:[0,0,0,0]', policy: 'weighted', phase: 'training' }, totalTrajectories: manifest.protocolBudget, completedTrajectories: 1 });
    await expect(store.putTrajectory(identity, { ...progress, record: { ...record(1), outcome: 2 } })).rejects.toThrow('Conflicting');
    expect(client.objects.size).toBe(2);
    expect([...client.objects.keys()].find(key => key.includes('/ledger/'))).toMatch(/000001\.json$/);
  });

  test('rejects wrong identity and isolates owners', async () => {
    const client = fakeS3(); const store = new TrainingEvidenceStore(client as any, 'private');
    await store.putManifest(identity, manifest);
    await expect(store.putManifest({ ...identity, manifestHash: 'other' }, manifest)).rejects.toThrow('hash');
    await expect(store.putManifest({ ...identity, scenarioHash: 'other' }, manifest)).rejects.toThrow('scenario');
    expect(await store.getManifest({ ...identity, ownerHash: 'another' })).toBeNull();
    await expect(store.putManifest({ ...identity, ownerHash: '../escape' }, manifest)).rejects.toThrow('Invalid');
  });

  test('does not finalize incomplete or gapped evidence', async () => {
    const client = fakeS3(); const store = new TrainingEvidenceStore(client as any, 'private');
    await store.putManifest(identity, manifest);
    await store.putTrajectory(identity, { completedTrajectories: 1, totalTrajectories: manifest.protocolBudget, record: record(1) });
    await store.putTrajectory(identity, { completedTrajectories: 3, totalTrajectories: manifest.protocolBudget, record: record(3) });
    await expect(store.finalize(identity, { audit: 'failed', artifactHash: 'artifact-1' })).rejects.toThrow('Missing trajectory');
    expect([...client.objects.keys()].some(key => key.endsWith('/ledger.jsonl') || key.endsWith('/final-audit.json'))).toBe(false);
  });

  test('replays every persisted trajectory into a hashed immutable snapshot before final audit', async () => {
    const client = fakeS3(); const store = new TrainingEvidenceStore(client as any, 'private');
    await store.putManifest(identity, manifest);
    for (let n = 1; n <= manifest.protocolBudget; n++) {
      await store.putTrajectory(identity, { completedTrajectories: n, totalTrajectories: manifest.protocolBudget, record: record(n) });
    }
    const expectedRecords = Array.from({ length: manifest.protocolBudget }, (_, index) => record(index + 1));
    const contents = { schemaVersion: 1 as const, policyVersion: 0, weights: [0, 0, 0, 0] as const, recommendation: 'sgc-fallback' as const,
      params: { seed: 42, days: 20 } as PolicyArtifact['params'], manifest, manifestHash: identity.manifestHash };
    const artifact: PolicyArtifact = { ...contents, artifactHash: createHash('sha256').update(JSON.stringify(contents)).digest('hex') };
    expectedRecords[0] = record(9999);
    await expect((store.finalize as any)(identity, { audit: 'failed', artifactHash: 'artifact-1' }, expectedRecords)).rejects.toThrow('mismatch');
    expect([...client.objects.keys()].some(key => key.endsWith('/final-audit.json'))).toBe(false);
    const final = await store.finalize(identity, { audit: 'failed', artifactHash: artifact.artifactHash });
    const snapshotKey = [...client.objects.keys()].find(key => key.endsWith('/ledger.jsonl'))!;
    const snapshot = client.objects.get(snapshotKey)!;
    expect(final.trajectoryCount).toBe(manifest.protocolBudget);
    expect(final.ledgerHash).toBe(createHash('sha256').update(snapshot).digest('hex'));
    expect(snapshot.trimEnd().split('\n')).toHaveLength(manifest.protocolBudget);
    expect(await store.getFinalAudit(identity)).toEqual(final);
    const pointer = await store.putArtifact(identity, artifact, final);
    expect(pointer.key).toBe(`committee/${identity.ownerHash}/${identity.jobId}/artifact.json`);
    expect(pointer.artifactHash).toBe(artifact.artifactHash);
    expect((await store.getArtifact(identity))?.artifact).toEqual(artifact);
    expect(await store.putArtifact(identity, artifact, final)).toEqual(pointer);
    await expect(store.putArtifact(identity, { ...artifact, policyVersion: 1 }, final)).rejects.toThrow();
    expect(await store.finalize(identity, { audit: 'failed', artifactHash: artifact.artifactHash })).toEqual(final);
    await expect(store.finalize(identity, { audit: 'passed', artifactHash: artifact.artifactHash, finalEvidence: { meanDifference: -1, upperBound: -0.5 } })).rejects.toThrow('Conflicting');
  });
});
