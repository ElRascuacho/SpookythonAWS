import { createHash } from 'node:crypto';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { trainOffline } from '../../src/domain/committee/offline';
import { computeManifestHash } from '../../src/domain/committee/manifest';
import { DEFAULT_COMPATIBILITY_VERSIONS, type CompatibilityVersions, type PolicyWeights } from '../../src/domain/committee/types';

type TrainingResult = ReturnType<typeof trainOffline>;

export interface RegisteredPolicy {
  registryVersion: string;
  publishedAt: string;
  audit: TrainingResult['audit'];
  finalEvidence: TrainingResult['finalEvidence'];
  artifact: TrainingResult['artifact'];
  recordHash: string;
}

export interface PublicPolicyProjection {
  registryVersion: string;
  publishedAt: string;
  policyVersion: number;
  recommendation: 'trained' | 'sgc-fallback';
  weights: PolicyWeights;
  audit: 'passed' | 'failed';
  finalEvidence: { meanDifference: number; upperBound: number } | null;
  compatibilityVersions: CompatibilityVersions;
  projectionHash: string;
}

const prefix = 'committee-policies/versions/';
const pointerKey = 'committee-policies/latest.json';

const hashRecord = (record: Omit<RegisteredPolicy, 'recordHash'>) =>
  createHash('sha256').update(JSON.stringify(record)).digest('hex');

export const hashProjection = (proj: Omit<PublicPolicyProjection, 'projectionHash'>): string => {
  const contents = {
    registryVersion: proj.registryVersion,
    publishedAt: proj.publishedAt,
    policyVersion: proj.policyVersion,
    recommendation: proj.recommendation,
    weights: proj.weights,
    audit: proj.audit,
    finalEvidence: proj.finalEvidence,
    compatibilityVersions: proj.compatibilityVersions,
  };
  return createHash('sha256').update(JSON.stringify(contents)).digest('hex');
};

export function toPublicProjection(record: RegisteredPolicy): PublicPolicyProjection {
  const contents: Omit<PublicPolicyProjection, 'projectionHash'> = {
    registryVersion: record.registryVersion,
    publishedAt: record.publishedAt,
    policyVersion: record.artifact.policyVersion,
    recommendation: record.artifact.recommendation,
    weights: record.artifact.weights,
    audit: record.audit === 'passed' ? 'passed' : 'failed',
    finalEvidence: record.finalEvidence ?? null,
    compatibilityVersions: record.artifact.manifest?.versions ?? DEFAULT_COMPATIBILITY_VERSIONS,
  };
  return {
    ...contents,
    projectionHash: hashProjection(contents),
  };
}

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

  toPublicProjection(record: RegisteredPolicy): PublicPolicyProjection {
    return toPublicProjection(record);
  }

  async publish(result: TrainingResult, now = new Date(), id?: string): Promise<RegisteredPolicy> {
    const publishedAt = now.toISOString();
    let versionId = id;
    if (!versionId) {
      // Deterministic version tied to approved policy version and artifact hash, without leaking jobId
      const shortHash = result.artifact.artifactHash.slice(0, 12);
      versionId = `v${result.artifact.policyVersion}-${shortHash}`;
    }
    if (!/^[A-Za-z0-9-]+$/.test(versionId)) throw new Error('Invalid version id');
    const registryVersion = `${publishedAt}_${versionId}`;
    const contents = { registryVersion, publishedAt, audit: result.audit, finalEvidence: result.finalEvidence, artifact: result.artifact };
    const record: RegisteredPolicy = { ...contents, recordHash: hashRecord(contents) };
    validate(record);

    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: `${prefix}${registryVersion}.json`,
      Body: JSON.stringify(record),
      ContentType: 'application/json',
      IfNoneMatch: '*',
    }));

    // Update pointer latest.json using CAS with the sanitized public projection
    const projection = toPublicProjection(record);
    await this.updateLatestPointer(projection);

    return record;
  }

  private async updateLatestPointer(projection: PublicPolicyProjection): Promise<void> {
    let previousETag: string | undefined;
    try {
      const existing = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: pointerKey }));
      previousETag = (existing as { ETag?: string }).ETag;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name !== 'NoSuchKey' && name !== 'NotFound') {
        // If retrieving the pointer fails for other reasons, still attempt conditional write or propagate
      }
    }

    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: pointerKey,
        Body: JSON.stringify(projection),
        ContentType: 'application/json',
        ...(previousETag ? { IfMatch: previousETag } : {}),
      }));
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'PreconditionFailed') {
        // Concurrent update won
        return;
      }
      throw error;
    }
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

  async latestProjection(): Promise<PublicPolicyProjection | null> {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: pointerKey }));
      if (object.Body) {
        const text = await object.Body.transformToString();
        const projection = JSON.parse(text) as PublicPolicyProjection;
        const { projectionHash, ...contents } = projection;
        if (hashProjection(contents) === projectionHash) {
          return projection;
        }
      }
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name !== 'NoSuchKey' && name !== 'NotFound') throw error;
    }

    const record = await this.latest();
    return record ? toPublicProjection(record) : null;
  }

  async latest(): Promise<RegisteredPolicy | null> {
    // Try pointer first to resolve latest registered version
    try {
      const pointer = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: pointerKey }));
      if (pointer.Body) {
        const parsed = JSON.parse(await pointer.Body.transformToString()) as { registryVersion?: string };
        if (parsed?.registryVersion) {
          const resolved = await this.get(parsed.registryVersion);
          if (resolved) return resolved;
        }
      }
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name !== 'NoSuchKey' && name !== 'NotFound') throw error;
    }

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
