import { describe, expect, test } from 'bun:test';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { trainOffline } from '../../src/domain/committee/offline';
import { PolicyRegistry } from '../committee/policyRegistry';

const training = trainOffline({ jobId: 'registry-test', baseSeed: 5, horizonDays: 20, simulate: ({ policy }) => ({ totalCumulativeInfected: policy === 'weighted' ? 90 : 100, timeline: [] }) });
function fakeS3() {
  const objects = new Map<string, string>();
  return { objects, async send(command: any): Promise<any> {
    const input = command.input;
    if (command instanceof PutObjectCommand) {
      if (objects.has(input.Key)) throw Object.assign(new Error('exists'), { name: 'PreconditionFailed' });
      expect(input.IfNoneMatch).toBe('*'); objects.set(input.Key, input.Body); return {};
    }
    if (command instanceof ListObjectsV2Command) return { Contents: [...objects.keys()].map(Key => ({ Key })) };
    if (command instanceof GetObjectCommand) {
      const value = objects.get(input.Key); if (!value) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      return { Body: { transformToString: async () => value } };
    }
    throw new Error('unexpected command');
  } };
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
