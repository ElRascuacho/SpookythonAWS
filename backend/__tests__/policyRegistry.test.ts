import { describe, expect, test } from 'bun:test';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { trainOffline } from '../../src/domain/committee/offline';
import { PolicyRegistry } from '../committee/policyRegistry';

const training = trainOffline({ jobId: 'registry-test', baseSeed: 5, horizonDays: 20, simulate: ({ policy }) => ({ totalCumulativeInfected: policy === 'weighted' ? 90 : 100, timeline: [] }) });
function fakeS3() {
  const objects = new Map<string, string>();
  const etags = new Map<string, string>();
  let etagCounter = 1;
  return {
    objects,
    etags,
    async send(command: any): Promise<any> {
      const input = command.input;
      if (command instanceof PutObjectCommand) {
        if (input.IfNoneMatch === '*' && objects.has(input.Key)) {
          throw Object.assign(new Error('exists'), { name: 'PreconditionFailed' });
        }
        if (input.IfMatch && etags.get(input.Key) !== input.IfMatch) {
          throw Object.assign(new Error('etag mismatch'), { name: 'PreconditionFailed' });
        }
        const etag = `"${etagCounter++}"`;
        objects.set(input.Key, input.Body);
        etags.set(input.Key, etag);
        return { ETag: etag };
      }
      if (command instanceof ListObjectsV2Command) return { Contents: [...objects.keys()].map(Key => ({ Key })) };
      if (command instanceof GetObjectCommand) {
        const value = objects.get(input.Key);
        if (!value) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
        return { Body: { transformToString: async () => value }, ETag: etags.get(input.Key) ?? '"1"' };
      }
      throw new Error('unexpected command');
    },
  };
}
describe('policy registry', () => {
  test('publishes a frozen version outside the expiring preview prefix and reads the latest', async () => {
    const client = fakeS3(); const registry = new PolicyRegistry(client as any, 'bucket');
    const stored = await registry.publish(training, new Date('2026-10-28T12:00:00Z'), 'version-1');
    expect([...client.objects.keys()][0]).toStartWith('committee-policies/');
    expect(await registry.latest()).toEqual(stored);
    await expect(registry.publish(training, new Date('2026-10-28T12:00:00Z'), 'version-1')).rejects.toThrow();
  });
  test('rejects inconsistent audit and propagates storage errors', async () => {
    const client = fakeS3(); const registry = new PolicyRegistry(client as any, 'bucket');
    await expect(registry.publish({ ...training, audit: 'not-run' } as any)).rejects.toThrow();
    expect(await registry.latest()).toBeNull();
    const failing = new PolicyRegistry({ send: async () => { throw new Error('denied'); } } as any, 'bucket');
    await expect(failing.latest()).rejects.toThrow('denied');
  });
});

test('integrity covers final audit and evidence', async () => {
  const client = fakeS3(); const registry = new PolicyRegistry(client as any, 'bucket');
  await registry.publish(training, new Date('2026-10-28T12:00:00Z'), 'version-integrity');
  const key = [...client.objects.keys()][0];
  const record = JSON.parse(client.objects.get(key)!);
  record.finalEvidence.upperBound = -999;
  client.objects.set(key, JSON.stringify(record));
  await expect(registry.latest()).rejects.toThrow('integrity');
});

test('reads exact immutable version, rejects invalid paths and distinguishes missing from denial', async () => {
  const client = fakeS3(); const registry = new PolicyRegistry(client as any, 'bucket');
  const stored = await registry.publish(training, new Date('2026-10-28T12:00:00Z'), 'version-exact');
  expect(await registry.get(stored.registryVersion)).toEqual(stored);
  const key = [...client.objects.keys()][0];
  const modified = JSON.parse(client.objects.get(key)!);
  modified.audit = 'not-run';
  client.objects.set(key, JSON.stringify(modified));
  await expect(registry.get(stored.registryVersion)).rejects.toThrow('integrity');
  expect(await registry.get('2026-10-28T12:00:00.000Z_missing')).toBeNull();
  await expect(registry.get('../other')).rejects.toThrow();
  const failing = new PolicyRegistry({ send: async () => { throw Object.assign(new Error('denied'), { name: 'AccessDenied' }); } } as any, 'bucket');
  await expect(failing.get(stored.registryVersion)).rejects.toThrow('denied');
});

test('sanitizes public policy projection and strips private fields without leaking jobId', async () => {
  const client = fakeS3();
  const registry = new PolicyRegistry(client as any, 'bucket');
  const stored = await registry.publish(training, new Date('2026-10-28T12:00:00Z'));

  // Deterministic version without leaking jobId
  expect(stored.registryVersion).not.toContain('registry-test');
  expect(stored.registryVersion).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_v\d+-[a-f0-9]{12}$/);

  // Check public projection
  const projection = registry.toPublicProjection(stored);
  expect(projection.registryVersion).toBe(stored.registryVersion);
  expect(projection.policyVersion).toBe(stored.artifact.policyVersion);
  expect(projection.weights).toEqual(stored.artifact.weights);
  expect(projection.recommendation).toBe(stored.artifact.recommendation);
  expect(projection.audit).toBe(stored.audit === 'passed' ? 'passed' : 'failed');
  expect(projection.finalEvidence).toEqual(stored.finalEvidence ?? null);
  expect(projection.projectionHash).toMatch(/^[a-f0-9]{64}$/);

  // Strictly no private fields
  expect((projection as any).params).toBeUndefined();
  expect((projection as any).patientZeroIds).toBeUndefined();
  expect((projection as any).seed).toBeUndefined();
  expect((projection as any).manifest).toBeUndefined();
  expect((projection as any).jobId).toBeUndefined();
  expect((projection as any).rngSeeds).toBeUndefined();
  expect((projection as any).pools).toBeUndefined();

  // Pointer latest.json exists and returns projection
  expect(client.objects.has('committee-policies/latest.json')).toBe(true);
  const latestProjection = await registry.latestProjection();
  expect(latestProjection).toEqual(projection);
});
