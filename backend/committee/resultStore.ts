import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

export async function loadCommitteeResult(ownerHash: string, jobId: string): Promise<StoredCommitteeJob | null> {
  const name = bucket();
  if (!name) return memory.get(`${ownerHash}:${jobId}`) ?? null;
  const client = new S3Client({});
  try {
    const object = await client.send(new GetObjectCommand({
      Bucket: name,
      Key: key(ownerHash, jobId),
    }));
    const raw = await object.Body?.transformToString();
    if (!raw) return null;
    const job = JSON.parse(raw) as StoredCommitteeJob;
    return job.ownerHash === ownerHash ? job : null;
  } catch {
    return null;
  }
}
