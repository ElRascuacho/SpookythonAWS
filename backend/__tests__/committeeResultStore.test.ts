import { describe, expect, test } from 'bun:test';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { loadCommitteeResult } from '../committee/resultStore';

const error = (name: string) => Object.assign(new Error(name), { name });
function client(getError: string, keys: string[] = [], listError?: string) {
  return { async send(command: any): Promise<any> {
    if (command instanceof GetObjectCommand) throw error(getError);
    if (command instanceof ListObjectsV2Command) {
      if (listError) throw error(listError);
      return { Contents: keys.map(Key => ({ Key })) };
    }
    throw new Error('unexpected');
  } } as any;
}
describe('committee result storage errors', () => {
  test('treats genuine 404 and confirmed missing 403 as missing', async () => {
    expect(await loadCommitteeResult('owner', 'job', { bucket: 'b', client: client('NoSuchKey') })).toBeNull();
    expect(await loadCommitteeResult('owner', 'job', { bucket: 'b', client: client('AccessDenied') })).toBeNull();
  });
  test('does not mask 403 for existing key or inability to list', async () => {
    await expect(loadCommitteeResult('owner', 'job', { bucket: 'b', client: client('AccessDenied', ['committee/owner/job.json']) })).rejects.toThrow('AccessDenied');
    await expect(loadCommitteeResult('owner', 'job', { bucket: 'b', client: client('AccessDenied', [], 'AccessDenied') })).rejects.toThrow('AccessDenied');
    await expect(loadCommitteeResult('owner', 'job', { bucket: 'b', client: client('InternalError') })).rejects.toThrow('InternalError');
  });
});
