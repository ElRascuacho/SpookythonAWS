import { runCommitteePreview } from "../src/domain/committee/runner";
import { saveCommitteeResult } from "./committee/resultStore";

export interface CommitteeWorkerEvent {
  jobId?: string;
  ownerHash?: string;
  horizonDays?: number;
  baseSeed?: number;
}

export async function handler(event: CommitteeWorkerEvent = {}) {
  const jobId = event.jobId ?? "";
  const ownerHash = event.ownerHash ?? "";
  const horizonDays = Number(event.horizonDays ?? 40);
  const baseSeed = Number(event.baseSeed ?? 20261030);
  if (!jobId || !ownerHash) {
    return { ok: false, error: "jobId and ownerHash are required" };
  }
  const result = runCommitteePreview({ jobId, baseSeed, horizonDays });
  await saveCommitteeResult({ jobId, ownerHash, horizonDays, baseSeed, result });
  return { ok: true, jobId, status: result.status, trajectories: result.trajectories };
}
