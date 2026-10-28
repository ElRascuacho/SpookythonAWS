import { createHash, randomUUID } from 'node:crypto';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { trainOffline } from '../../src/domain/committee/offline';
import { computeManifestHash } from '../../src/domain/committee/manifest';

type TrainingResult = ReturnType<typeof trainOffline>;
export interface RegisteredPolicy {
  registryVersion: string;
  publishedAt: string;
  audit: TrainingResult['audit'];
  finalEvidence: TrainingResult['finalEvidence'];
  artifact: TrainingResult['artifact'];
  recordHash: string;
}
const prefix = 'committee-policies/versions/';
const hashRecord = (record: Omit<RegisteredPolicy, 'recordHash'>) => createHash('sha256').update(JSON.stringify(record)).digest('hex');

function validate(record: RegisteredPolicy): void {
  const { recordHash, ...recordContents } = record;
  if (hashRecord(recordContents) !== recordHash) throw new Error('Policy record integrity mismatch');
  const { artifact, audit, finalEvidence } = record;
  const { artifactHash, ...contents } = artifact;
  if (createHash('sha256').update(JSON.stringify(contents)).digest('hex') !== artifactHash || computeManifestHash(artifact.manifest) !== artifact.manifestHash) throw new Error('Policy integrity mismatch');
  if (artifact.weights.length !== 4 || artifact.weights.some(n => !Number.isFinite(n) || n < -3 || n > 3)) throw new Error('Invalid weights');
  const approved = artifact.recommendation === 'trained' && artifact.policyVersion > 0 && audit === 'passed' && finalEvidence && finalEvidence.meanDifference < 0 && finalEvidence.upperBound < 0;
  const fallback = artifact.recommendation === 'sgc-fallback' && artifact.policyVersion === 0 && audit === 'failed' && artifact.weights.every(n => n === 0);
  if (!approved && !fallback) throw new Error('Policy has no valid final audit');
}

/** Append-only versions; registryVersion is distinct from the run-local policyVersion. */
export class PolicyRegistry {
  constructor(private readonly client: Pick<S3Client, 'send'>, private readonly bucket: string) {}
  async publish(result: TrainingResult, now = new Date(), id: string = randomUUID()): Promise<RegisteredPolicy> {
    if (!/^[A-Za-z0-9-]+$/.test(id)) throw new Error('Invalid version id');
    const publishedAt = now.toISOString();
    const registryVersion = `${publishedAt}_${id}`;
    const contents = { registryVersion, publishedAt, audit: result.audit, finalEvidence: result.finalEvidence, artifact: result.artifact };
    const record: RegisteredPolicy = { ...contents, recordHash: hashRecord(contents) };
    validate(record);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: `${prefix}${registryVersion}.json`, Body: JSON.stringify(record), ContentType: 'application/json', IfNoneMatch: '*' }));
    return record;
  }
  async get(registryVersion: string): Promise<RegisteredPolicy | null> {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[A-Za-z0-9-]+$/.test(registryVersion)) throw new Error('Invalid registry version');
    let object;
    try {
      object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: `${prefix}${registryVersion}.json` }));
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw error;
    }
    if (!object.Body) throw new Error('Policy object has no body');
    const record = JSON.parse(await object.Body.transformToString()) as RegisteredPolicy;
    if (record.registryVersion !== registryVersion) throw new Error('Policy version mismatch');
    validate(record);
    return record;
  }
  async latest(): Promise<RegisteredPolicy | null> {
    let token: string | undefined; let latest: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const item of page.Contents ?? []) if (item.Key?.startsWith(prefix) && item.Key.endsWith('.json') && (!latest || item.Key > latest)) latest = item.Key;
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !token) throw new Error('Incomplete policy listing');
    } while (token);
    if (!latest) return null;
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: latest }));
    if (!object.Body) throw new Error('Policy object has no body');
    const record = JSON.parse(await object.Body.transformToString()) as RegisteredPolicy;
    if (`${prefix}${record.registryVersion}.json` !== latest) throw new Error('Policy version mismatch');
    validate(record);
    return record;
  }
}
