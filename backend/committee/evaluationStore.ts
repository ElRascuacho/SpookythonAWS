import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

/** Identity is stored with every object, not inferred from its S3 key. */
export interface EvaluationIdentity {
  ownerHash: string;
  jobId: string;
  registryVersion: string;
  artifactHash: string;
  scenarioHash: string;
}
export interface CompactEvaluationPair {
  completedPairs: number;
  totalPairs: number;
  runIndex: number;
  candidate: number;
  sgc: number;
}
export interface CompactEvaluationReport {
  completedPairs: number;
  totalPairs: number;
  meanImprovement: number;
}
type Envelope<T> = { identity: EvaluationIdentity; value: T };
const canonicalJson = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
  return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
});

/** Private immutable object primitives; admission and worker orchestration are intentionally separate. */
export class EvaluationStore {
  constructor(private readonly client: Pick<S3Client, 'send'>, private readonly bucket: string) {
    if (!bucket) throw new Error('Invalid bucket');
  }

  private prefix(identity: EvaluationIdentity): string {
    if (!/^[A-Za-z0-9-]+$/.test(identity.ownerHash) || !/^[A-Za-z0-9-]+$/.test(identity.jobId)
      || !identity.registryVersion || !identity.artifactHash || !identity.scenarioHash) throw new Error('Invalid evaluation identity');
    return `committee-evaluations/${identity.ownerHash}/${identity.jobId}/`;
  }
  private pairKey(identity: EvaluationIdentity, completedPairs: number): string {
    if (!Number.isSafeInteger(completedPairs) || completedPairs < 1) throw new Error('Invalid pair index');
    return `${this.prefix(identity)}pairs/${completedPairs}.json`;
  }
  private async read<T>(key: string, identity: EvaluationIdentity): Promise<T | null> {
    try {
      const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!object.Body) throw new Error('Evaluation object has no body');
      const envelope = JSON.parse(await object.Body.transformToString()) as Envelope<T>;
      if (!envelope.identity || (['ownerHash', 'jobId', 'registryVersion', 'artifactHash', 'scenarioHash'] as const).some(field => envelope.identity[field] !== identity[field])) throw new Error('Evaluation identity mismatch');
      return envelope.value;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw error;
    }
  }
  private async write<T>(key: string, identity: EvaluationIdentity, value: T): Promise<void> {
    const body = JSON.stringify({ identity, value });
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: 'application/json', IfNoneMatch: '*' }));
    } catch (error) {
      const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name !== 'PreconditionFailed' && e.$metadata?.httpStatusCode !== 412) throw error;
      let existing: T | null;
      try { existing = await this.read<T>(key, identity); } catch (readError) {
        if ((readError as Error).message === 'Evaluation identity mismatch') throw new Error('Conflicting evaluation object');
        throw readError;
      }
      if (existing === null || canonicalJson(existing) !== canonicalJson(value)) throw new Error('Conflicting evaluation object');
    }
  }
  async putPair(identity: EvaluationIdentity, pair: CompactEvaluationPair): Promise<void> {
    if (!Number.isSafeInteger(pair.totalPairs) || pair.totalPairs < pair.completedPairs || !Number.isSafeInteger(pair.runIndex)
      || !Number.isFinite(pair.candidate) || !Number.isFinite(pair.sgc)) throw new Error('Invalid evaluation pair');
    await this.write(this.pairKey(identity, pair.completedPairs), identity, pair);
  }
  async getPair(identity: EvaluationIdentity, completedPairs: number): Promise<CompactEvaluationPair | null> {
    return this.read(this.pairKey(identity, completedPairs), identity);
  }
  async putReport(identity: EvaluationIdentity, report: CompactEvaluationReport): Promise<void> {
    if (!Number.isSafeInteger(report.totalPairs) || report.totalPairs < 1 || report.completedPairs !== report.totalPairs
      || !Number.isFinite(report.meanImprovement)) throw new Error('Invalid evaluation report');
    await this.write(`${this.prefix(identity)}report.json`, identity, report);
  }
  async getReport(identity: EvaluationIdentity): Promise<CompactEvaluationReport | null> {
    return this.read(`${this.prefix(identity)}report.json`, identity);
  }
}
