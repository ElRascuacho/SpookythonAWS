import { randomUUID } from "node:crypto";
import {
  runCommitteePreview,
  type CommitteeRunRequest,
  type CommitteeRunResult,
} from "../../src/domain/committee/runner";

export interface CommitteeJob {
  id: string;
  ownerHash: string;
  idempotencyKey: string;
  horizonDays: number;
  baseSeed: number;
  status: "completed" | "cancelled";
  stateRevision: number;
  result: CommitteeRunResult;
}

const jobs = new Map<string, CommitteeJob>();
const idempotency = new Map<string, string>();
let active = false;

export function resetCommitteeJobs(): void {
  jobs.clear();
  idempotency.clear();
  active = false;
}

export function startCommitteeJob(input: {
  ownerHash: string;
  idempotencyKey: string;
  horizonDays: number;
  baseSeed: number;
  audit?: boolean;
  run?: (request: CommitteeRunRequest) => CommitteeRunResult;
}): CommitteeJob | { error: "slot" | "invalid" } {
  const horizonDays = Math.round(input.horizonDays);
  if (!Number.isFinite(horizonDays) || horizonDays < 20 || horizonDays > 60) {
    return { error: "invalid" };
  }
  const idemKey = `${input.ownerHash}:${input.idempotencyKey}`;
  const existingId = idempotency.get(idemKey);
  if (existingId) return jobs.get(existingId)!;
  if (active) return { error: "slot" };
  active = true;
  const id = randomUUID();
  const job: CommitteeJob = {
    id,
    ownerHash: input.ownerHash,
    idempotencyKey: input.idempotencyKey,
    horizonDays,
    baseSeed: input.baseSeed,
    status: "completed",
    stateRevision: 1,
    result: {
      status: "completed",
      stateRevision: 1,
      recommendedPolicyVersion: 0,
      finalAudit: "not-run",
      weights: [0, 0, 0, 0],
      baselineMean: 0,
      candidateMean: null,
      trajectories: 0,
      playback: [],
      note: "",
    },
  };
  jobs.set(id, job);
  idempotency.set(idemKey, id);
  try {
    const result = (input.run ?? runCommitteePreview)({
      jobId: id,
      baseSeed: input.baseSeed,
      horizonDays,
      limits: input.audit ? { includePromotion: true, includeFinalAudit: true } : undefined,
      shouldCancel: () => jobs.get(id)?.status === "cancelled",
    });
    job.result = result;
    job.status = result.status;
    job.stateRevision = result.stateRevision;
  } finally {
    active = false;
  }
  return job;
}

export function readCommitteeJob(ownerHash: string, id: string): CommitteeJob | null {
  const job = jobs.get(id);
  if (!job || job.ownerHash !== ownerHash) return null;
  return job;
}

export function cancelCommitteeJob(ownerHash: string, id: string): CommitteeJob | null {
  const job = jobs.get(id);
  if (!job || job.ownerHash !== ownerHash) return null;
  job.status = "cancelled";
  job.stateRevision += 1;
  job.result.status = "cancelled";
  job.result.stateRevision = job.stateRevision;
  return job;
}
