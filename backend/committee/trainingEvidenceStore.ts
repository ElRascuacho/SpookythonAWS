import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { computeManifestHash } from '../../src/domain/committee/manifest';
import type { TrajectoryRecord } from '../../src/domain/committee/offline';
import type { PolicyArtifact } from '../../src/domain/committee/offline';
import type { RunManifest } from '../../src/domain/committee/types';

export interface TrainingEvidenceIdentity {
  ownerHash: string;
  jobId: string;
  scenarioHash: string;
  manifestHash: string;
  versions: RunManifest['versions'];
}

export type CompactTrainingTrajectory = Omit<TrajectoryRecord, 'timeline'>;
export interface TrainingTrajectoryProgress {
  completedTrajectories: number;
  totalTrajectories: number;
  record: CompactTrainingTrajectory | TrajectoryRecord;
}
export interface TrainingFinalAuditInput {
  audit: 'passed' | 'failed';
  artifactHash: string;
  finalEvidence?: { meanDifference: number; upperBound: number };
}
export interface TrainingFinalAudit extends TrainingFinalAuditInput {
  trajectoryCount: number;
  ledgerHash: string;
}
export interface TrainingArtifactPointer { key: string; artifactHash: string }
export interface TrainingStoredArtifact { artifact: PolicyArtifact; finalAudit: TrainingFinalAudit }

type Envelope<T> = { identity: TrainingEvidenceIdentity; value: T };
const canonicalJson = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
  return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
});
const hash = (body: string): string => createHash('sha256').update(body).digest('hex');

/** Private, append-only training evidence primitives; job orchestration belongs to the executor. */
export class TrainingEvidenceStore {
  constructor(private readonly client: Pick<S3Client, 'send'>, private readonly bucket: string) {
    if (!bucket) throw new Error('Invalid bucket');
  }

  private prefix(identity: TrainingEvidenceIdentity): string {
    if (!/^[A-Za-z0-9-]+$/.test(identity.ownerHash) || !/^[A-Za-z0-9-]+$/.test(identity.jobId)
      || !identity.scenarioHash || !identity.manifestHash || !identity.versions
      || Object.values(identity.versions).some(value => typeof value !== 'string' || !value)) throw new Error('Invalid training evidence identity');
    return `committee/${identity.ownerHash}/${identity.jobId}/`;
  }

  private async readRaw(key: string): Promise<string | null> {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!object.Body) throw new Error('Training evidence object has no body');
      return await object.Body.transformToString();
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw error;
    }
  }

  private async writeRaw(key: string, body: string): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: key.endsWith('.jsonl') ? 'application/x-ndjson' : 'application/json', IfNoneMatch: '*' }));
    } catch (error) {
      const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name !== 'PreconditionFailed' && e.$metadata?.httpStatusCode !== 412) throw error;
      const existing = await this.readRaw(key);
      if (existing === null || existing !== body) throw new Error('Conflicting training evidence object');
    }
  }

  private async read<T>(key: string, identity: TrainingEvidenceIdentity): Promise<T | null> {
    const body = await this.readRaw(key);
    if (body === null) return null;
    const envelope = JSON.parse(body) as Envelope<T>;
    if (!envelope.identity || canonicalJson(envelope.identity) !== canonicalJson(identity)) throw new Error('Training evidence identity mismatch');
    return envelope.value;
  }

  private async write<T>(key: string, identity: TrainingEvidenceIdentity, value: T): Promise<void> {
    const body = canonicalJson({ identity, value });
    try {
      await this.writeRaw(key, body);
    } catch (error) {
      if ((error as Error).message !== 'Conflicting training evidence object') throw error;
      const existing = await this.read<T>(key, identity).catch(readError => {
        if ((readError as Error).message === 'Training evidence identity mismatch') throw new Error('Conflicting training evidence object');
        throw readError;
      });
      if (existing === null || canonicalJson(existing) !== canonicalJson(value)) throw error;
    }
  }

  async putManifest(identity: TrainingEvidenceIdentity, manifest: RunManifest): Promise<void> {
    const prefix = this.prefix(identity);
    if (manifest.jobId !== identity.jobId) throw new Error('Manifest job mismatch');
    if (manifest.scenarioHash !== identity.scenarioHash) throw new Error('Manifest scenario mismatch');
    if (computeManifestHash(manifest) !== identity.manifestHash) throw new Error('Manifest hash mismatch');
    if (canonicalJson(manifest.versions) !== canonicalJson(identity.versions)) throw new Error('Manifest version mismatch');
    if (!Number.isSafeInteger(manifest.protocolBudget) || manifest.protocolBudget < 1 || manifest.protocolBudget > 4096) throw new Error('Invalid manifest budget');
    await this.write(`${prefix}manifest.json`, identity, manifest);
  }

  async getManifest(identity: TrainingEvidenceIdentity): Promise<RunManifest | null> {
    const manifest = await this.read<RunManifest>(`${this.prefix(identity)}manifest.json`, identity);
    if (manifest && (manifest.jobId !== identity.jobId || manifest.scenarioHash !== identity.scenarioHash
      || computeManifestHash(manifest) !== identity.manifestHash || canonicalJson(manifest.versions) !== canonicalJson(identity.versions))) throw new Error('Manifest integrity mismatch');
    return manifest;
  }

  private trajectoryKey(identity: TrainingEvidenceIdentity, completed: number): string {
    if (!Number.isSafeInteger(completed) || completed < 1) throw new Error('Invalid trajectory sequence');
    return `${this.prefix(identity)}ledger/${String(completed).padStart(6, '0')}.json`;
  }

  async putTrajectory(identity: TrainingEvidenceIdentity, progress: TrainingTrajectoryProgress): Promise<void> {
    const manifest = await this.getManifest(identity);
    if (!manifest) throw new Error('Training manifest must be persisted first');
    const { completedTrajectories: completed, totalTrajectories: total } = progress;
    if (!Number.isSafeInteger(completed) || completed < 1 || completed > manifest.protocolBudget || total !== manifest.protocolBudget) throw new Error('Invalid trajectory progress');
    const { timeline: _timeline, ...record } = progress.record as TrajectoryRecord;
    if (!['baseline', 'training', 'selection', 'promotion', 'final'].includes(record.phase)
      || !['weighted', 'sgc', 'random', 'none'].includes(record.policy)
      || !record.policyId || !record.envNamespace || !Number.isSafeInteger(record.runIndex)
      || !Number.isFinite(record.outcome)) throw new Error('Invalid trajectory record');
    await this.write(this.trajectoryKey(identity, completed), identity, { completedTrajectories: completed, totalTrajectories: total, record });
  }

  async getTrajectory(identity: TrainingEvidenceIdentity, completed: number): Promise<TrainingTrajectoryProgress | null> {
    return this.read(this.trajectoryKey(identity, completed), identity);
  }

  async finalize(identity: TrainingEvidenceIdentity, input: TrainingFinalAuditInput, expectedRecords?: readonly CompactTrainingTrajectory[]): Promise<TrainingFinalAudit> {
    const manifest = await this.getManifest(identity);
    if (!manifest) throw new Error('Training manifest must be persisted first');
    if (!input.artifactHash || !['passed', 'failed'].includes(input.audit)
      || (input.audit === 'passed' && (!input.finalEvidence || input.finalEvidence.meanDifference >= 0 || input.finalEvidence.upperBound >= 0))) throw new Error('Invalid final audit');
    if (expectedRecords && expectedRecords.length !== manifest.protocolBudget) throw new Error('Training trajectory count mismatch');
    const lines: string[] = [];
    for (let sequence = 1; sequence <= manifest.protocolBudget; sequence++) {
      const progress = await this.getTrajectory(identity, sequence);
      if (!progress) throw new Error(`Missing trajectory ${sequence}`);
      if (progress.completedTrajectories !== sequence || progress.totalTrajectories !== manifest.protocolBudget) throw new Error(`Invalid trajectory ${sequence}`);
      if (expectedRecords && canonicalJson(progress.record) !== canonicalJson(expectedRecords[sequence - 1])) throw new Error(`Training trajectory mismatch at ${sequence}`);
      lines.push(canonicalJson({ identity, sequence, record: progress.record }));
    }
    const snapshot = `${lines.join('\n')}\n`;
    const ledgerHash = hash(snapshot);
    const prefix = this.prefix(identity);
    await this.writeRaw(`${prefix}ledger.jsonl`, snapshot);
    if (await this.readRaw(`${prefix}ledger.jsonl`) !== snapshot) throw new Error('Ledger read-back mismatch');
    const final: TrainingFinalAudit = { ...input, trajectoryCount: manifest.protocolBudget, ledgerHash };
    await this.write(`${prefix}final-audit.json`, identity, final);
    const verified = await this.getFinalAudit(identity);
    if (canonicalJson(verified) !== canonicalJson(final)) throw new Error('Final audit read-back mismatch');
    return final;
  }

  async getFinalAudit(identity: TrainingEvidenceIdentity): Promise<TrainingFinalAudit | null> {
    const final = await this.read<TrainingFinalAudit>(`${this.prefix(identity)}final-audit.json`, identity);
    if (!final) return null;
    const snapshot = await this.readRaw(`${this.prefix(identity)}ledger.jsonl`);
    if (snapshot === null || hash(snapshot) !== final.ledgerHash) throw new Error('Ledger integrity mismatch');
    if (snapshot.trimEnd().split('\n').length !== final.trajectoryCount) throw new Error('Ledger count mismatch');
    return final;
  }

  async putArtifact(identity: TrainingEvidenceIdentity, artifact: PolicyArtifact, finalAudit: TrainingFinalAudit): Promise<TrainingArtifactPointer> {
    const manifest = await this.getManifest(identity);
    const persistedAudit = await this.getFinalAudit(identity);
    if (!manifest || !persistedAudit || canonicalJson(finalAudit) !== canonicalJson(persistedAudit)) throw new Error('Final audit evidence mismatch');
    const { artifactHash, ...contents } = artifact;
    if (artifact.manifestHash !== identity.manifestHash || canonicalJson(artifact.manifest) !== canonicalJson(manifest)
      || hash(JSON.stringify(contents)) !== artifactHash || finalAudit.artifactHash !== artifactHash) throw new Error('Training artifact integrity mismatch');
    const key = `${this.prefix(identity)}artifact.json`;
    await this.write(key, identity, { artifactJson: JSON.stringify(artifact), finalAudit });
    if (canonicalJson(await this.getArtifact(identity)) !== canonicalJson({ artifact, finalAudit })) throw new Error('Training artifact read-back mismatch');
    return { key, artifactHash };
  }

  async getArtifact(identity: TrainingEvidenceIdentity): Promise<TrainingStoredArtifact | null> {
    const envelope = await this.read<{ artifactJson: string; finalAudit: TrainingFinalAudit }>(`${this.prefix(identity)}artifact.json`, identity);
    if (!envelope) return null;
    const stored: TrainingStoredArtifact = { artifact: JSON.parse(envelope.artifactJson) as PolicyArtifact, finalAudit: envelope.finalAudit };
    const audit = await this.getFinalAudit(identity);
    const manifest = await this.getManifest(identity);
    const { artifactHash, ...contents } = stored.artifact;
    if (!audit || !manifest || canonicalJson(audit) !== canonicalJson(stored.finalAudit)
      || stored.artifact.manifestHash !== identity.manifestHash || canonicalJson(stored.artifact.manifest) !== canonicalJson(manifest)
      || hash(JSON.stringify(contents)) !== artifactHash || audit.artifactHash !== artifactHash) throw new Error('Training artifact integrity mismatch');
    return stored;
  }
}
