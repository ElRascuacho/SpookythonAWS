import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { CommitteeRunResult } from "../../src/domain/committee/runner";

export interface StoredCommitteeJob {
  jobId: string;
  ownerHash: string;
  horizonDays: number;
  baseSeed: number;
  result: CommitteeRunResult;
}

const memory = new Map<string, StoredCommitteeJob>();

function bucket(): string | undefined {
  return process.env.COMMITTEE_RESULTS_BUCKET || undefined;
}

function key(ownerHash: string, jobId: string): string {
  return `committee/${ownerHash}/${jobId}.json`;
}

export async function saveCommitteeResult(job: StoredCommitteeJob): Promise<void> {
  const name = bucket();
  if (!name) {
    memory.set(`${job.ownerHash}:${job.jobId}`, job);
    return;
  }
  const client = new S3Client({});
  await client.send(new PutObjectCommand({
    Bucket: name,
    Key: key(job.ownerHash, job.jobId),
    Body: JSON.stringify(job),
    ContentType: "application/json",
  }));
}

export async function loadCommitteeResult(ownerHash: string, jobId: string, options?: { bucket: string; client: Pick<S3Client, "send"> }): Promise<StoredCommitteeJob | null> {
  const name = options?.bucket ?? bucket();
  if (!name) return memory.get(`${ownerHash}:${jobId}`) ?? null;
  const client = options?.client ?? new S3Client({});
  const objectKey = key(ownerHash, jobId);
  try {
    const object = await client.send(new GetObjectCommand({
      Bucket: name,
      Key: objectKey,
    }));
    const raw = await object.Body?.transformToString();
    if (!raw) return null;
    const job = JSON.parse(raw) as StoredCommitteeJob;
    return job.ownerHash === ownerHash ? job : null;
  } catch (error) {
    const errorName = (error as { name?: string }).name;
    if (errorName === "NoSuchKey" || errorName === "NotFound") return null;
    if (errorName === "AccessDenied" || (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 403) {
      // GetObject may return 403 for a missing key without bucket-list permission.
      // A scoped listing can prove absence; any listing failure remains an error.
      let token: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: name, Prefix: objectKey, ContinuationToken: token }));
        if (page.Contents?.some(item => item.Key === objectKey)) throw error;
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && !token) throw new Error("Incomplete result listing");
      } while (token);
      return null;
    }
    throw error;
  }
}
