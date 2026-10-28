import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { runCommitteePreview } from "../src/domain/committee/runner";
import { saveCommitteeResult } from "./committee/resultStore";
import { CommitteeAdmissionService } from "./committee/admissionService";
import { EvaluationJobService } from "./committee/evaluationJobService";
import { EvaluationStore } from "./committee/evaluationStore";
import { EvaluationExecutor } from "./committee/evaluationExecutor";
import { PolicyRegistry } from "./committee/policyRegistry";

export interface CommitteeWorkerEvent {
  type?: "preview" | "evaluation" | "training";
  jobId?: string;
  ownerHash?: string;
  horizonDays?: number;
  baseSeed?: number;
}

export interface WorkerHandlerDependencies {
  executor?: { execute(jobId: string, ownerHash?: string): Promise<{ status: string; pairsCompleted: number }> };
}

export async function handler(
  event: CommitteeWorkerEvent = {},
  deps?: WorkerHandlerDependencies,
) {
  const jobId = event.jobId ?? "";
  const ownerHash = event.ownerHash ?? "";
  const horizonDays = Number(event.horizonDays ?? 40);
  const baseSeed = Number(event.baseSeed ?? 20261030);
  if (!jobId || !ownerHash) {
    return { ok: false, error: "jobId and ownerHash are required" };
  }

  if (event.type === "evaluation") {
    if (deps?.executor) {
      const res = await deps.executor.execute(jobId, ownerHash);
      return { ok: true, jobId, status: res.status, pairsCompleted: res.pairsCompleted };
    }
    const tableName = process.env.DDB_COMMITTEE_TABLE;
    const bucket = process.env.COMMITTEE_RESULTS_BUCKET;
    if (!tableName || !bucket) {
      return { ok: false, error: "Missing DDB_COMMITTEE_TABLE or COMMITTEE_RESULTS_BUCKET" };
    }
    const ddb = new DynamoDBClient({});
    const s3 = new S3Client({});
    const admission = new CommitteeAdmissionService(ddb, tableName);
    const registry = new PolicyRegistry(s3, bucket);
    const store = new EvaluationStore(s3, bucket);
    const evaluationJobs = new EvaluationJobService(admission, registry);
    const executor = new EvaluationExecutor({ admission, evaluationJobs, registry, store });
    const res = await executor.execute(jobId, ownerHash);
    return { ok: true, jobId, status: res.status, pairsCompleted: res.pairsCompleted };
  }

  const result = runCommitteePreview({ jobId, baseSeed, horizonDays });
  await saveCommitteeResult({ jobId, ownerHash, horizonDays, baseSeed, result });
  return { ok: true, jobId, status: result.status, trajectories: result.trajectories };
}
