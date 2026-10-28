import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PolicyRegistry, type RegisteredPolicy } from "./policyRegistry";
import { json, ownerHash } from "../auth";
import { cancelCommitteeJob, readCommitteeJob, startCommitteeJob } from "./jobStore";
import { loadCommitteeResult } from "./resultStore";
import { CommitteeAdmissionService } from "./admissionService";
import { EvaluationJobService } from "./evaluationJobService";
import { EvaluationStore, type EvaluationIdentity } from "./evaluationStore";
import { hashPayload } from "./conditions";
import {
  IdempotencyConflictError,
  JobNotFoundError,
  QuotaExhaustedError,
  SlotBusyError,
} from "./types";
import type { CommitteeRunRequest, CommitteeRunResult } from "../../src/domain/committee/runner";

const forbidden = ["pools", "weights", "candidates", "quotas", "trainIndices"];

export interface CommitteeHttpDependencies {
  evaluationJobService?: EvaluationJobService;
  evaluationStore?: EvaluationStore;
  admissionService?: CommitteeAdmissionService;
  evaluationExecutor?: { execute(jobId: string, ownerHash?: string): Promise<unknown> };
}

export async function handleCommitteeRoute(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  run?: (request: CommitteeRunRequest) => CommitteeRunResult,
  policyReader?: { latest(): Promise<RegisteredPolicy | null>; get?(version: string): Promise<RegisteredPolicy | null> },
  resultReader: typeof loadCommitteeResult = loadCommitteeResult,
  deps?: CommitteeHttpDependencies,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/committee/")) return null;
  const owner = ownerHash(request, env);
  if (!owner) return json(401, { code: "auth.unauthorized", message: "Unauthorized" });

  const parts = url.pathname.split("/").filter(Boolean);

  // 1. Policy registry
  if (request.method === "GET" && url.pathname === "/api/committee/policies/latest") {
    const bucket = env.COMMITTEE_RESULTS_BUCKET;
    if (!policyReader && !bucket) return json(503, { code: "committee.policy_unavailable", message: "Policy registry unavailable" });
    try {
      const policy = await (policyReader ?? new PolicyRegistry(new S3Client({}), bucket!)).latest();
      return policy ? json(200, policy) : json(404, { code: "committee.not_found", message: "No published policy" });
    } catch {
      return json(503, { code: "committee.policy_unavailable", message: "Policy registry unavailable" });
    }
  }

  // 2. Training jobs (Priority 1)
  if (request.method === "POST" && url.pathname === "/api/committee/training/jobs") {
    if (env.COMMITTEE_TRAINING_ENABLED !== "true") {
      return json(503, { code: "committee.training_unavailable", message: "Training is not available" });
    }
    const admission = deps?.admissionService ?? (
      env.DDB_COMMITTEE_TABLE
        ? new CommitteeAdmissionService(new DynamoDBClient({}), env.DDB_COMMITTEE_TABLE)
        : null
    );
    if (!admission) {
      return json(503, { code: "committee.training_unavailable", message: "Training is not available" });
    }
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    if (idempotencyKey.length < 8) {
      return json(400, { code: "committee.invalid_request", message: "Idempotency-Key is required" });
    }
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      return json(400, { code: "committee.invalid_request", message: "Invalid JSON" });
    }
    if (forbidden.some((key) => key in body)) {
      return json(400, { code: "committee.invalid_request", message: "Internal search fields are rejected" });
    }
    const horizonDays = Number(body.horizonDays ?? 40);
    const baseSeed = Number(body.seed ?? 20261030);
    try {
      const admitted = await admission.admitJob({
        ownerHash: owner,
        idempotencyKey,
        scenario: {
          scenarioKey: "committee-training",
          horizonDays,
          seed: baseSeed,
        },
      });
      const workerName = env.COMMITTEE_WORKER_FUNCTION_NAME;
      if (workerName) {
        try {
          await new LambdaClient({}).send(new InvokeCommand({
            FunctionName: workerName,
            InvocationType: "Event",
            Payload: Buffer.from(JSON.stringify({ type: "training", jobId: admitted.jobId, ownerHash: owner, horizonDays, baseSeed })),
          }));
        } catch {
          return json(503, { code: "committee.worker_unavailable", message: "Worker invocation failed" });
        }
      }
      return json(202, {
        jobId: admitted.jobId,
        status: admitted.status,
        stateRevision: admitted.stateRevision,
        idempotent: admitted.idempotent,
        note: "Entrenamiento de comité admitido.",
      });
    } catch (err: unknown) {
      if (err instanceof SlotBusyError) {
        return json(409, { code: "committee.slot_busy", message: err.message });
      }
      if (err instanceof QuotaExhaustedError) {
        return json(429, { code: "committee.quota_exceeded", message: err.message });
      }
      if (err instanceof IdempotencyConflictError) {
        return json(409, { code: "committee.idempotency_conflict", message: err.message });
      }
      return json(503, { code: "committee.storage_unavailable", message: "Service unavailable" });
    }
  }

  // 3. Central evaluation routes (Priority 3)
  if (parts[2] === "evaluations") {
    const getEvalService = () => {
      if (deps?.evaluationJobService) return deps.evaluationJobService;
      if (env.DDB_COMMITTEE_TABLE && env.COMMITTEE_RESULTS_BUCKET) {
        const admission = deps?.admissionService ?? new CommitteeAdmissionService(new DynamoDBClient({}), env.DDB_COMMITTEE_TABLE);
        const registry = new PolicyRegistry(new S3Client({}), env.COMMITTEE_RESULTS_BUCKET);
        return new EvaluationJobService(admission, registry);
      }
      return null;
    };

    const getAdmissionService = () => {
      if (deps?.admissionService) return deps.admissionService;
      if (env.DDB_COMMITTEE_TABLE) {
        return new CommitteeAdmissionService(new DynamoDBClient({}), env.DDB_COMMITTEE_TABLE);
      }
      return null;
    };

    const getEvaluationStore = () => {
      if (deps?.evaluationStore) return deps.evaluationStore;
      if (env.COMMITTEE_RESULTS_BUCKET) {
        return new EvaluationStore(new S3Client({}), env.COMMITTEE_RESULTS_BUCKET);
      }
      return null;
    };

    // POST /api/committee/evaluations
    if (request.method === "POST" && parts.length === 3) {
      const evalService = getEvalService();
      if (!evalService) {
        return json(503, { code: "committee.evaluation_unavailable", message: "Central evaluation is not available" });
      }
      const idempotencyKey = request.headers.get("idempotency-key") ?? "";
      if (idempotencyKey.length < 8) {
        return json(400, { code: "committee.invalid_request", message: "Idempotency-Key is required" });
      }
      let body: Record<string, unknown> = {};
      try {
        body = await request.json();
      } catch {
        return json(400, { code: "committee.invalid_request", message: "Invalid JSON" });
      }
      const registryVersion = typeof body.registryVersion === "string" ? body.registryVersion.trim() : "";
      const seed = Number(body.seed);
      const plannedPairs = body.plannedPairs !== undefined ? Number(body.plannedPairs) : 128;
      if (!registryVersion || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(plannedPairs) || plannedPairs < 2 || plannedPairs > 128) {
        return json(400, { code: "committee.invalid_request", message: "Invalid evaluation parameters" });
      }

      try {
        const admitted = await evalService.admit({
          ownerHash: owner,
          idempotencyKey,
          registryVersion,
          seed,
          plannedPairs,
        });

        const workerName = env.COMMITTEE_WORKER_FUNCTION_NAME;
        if (workerName) {
          try {
            await new LambdaClient({}).send(new InvokeCommand({
              FunctionName: workerName,
              InvocationType: "Event",
              Payload: Buffer.from(JSON.stringify({ type: "evaluation", jobId: admitted.jobId, ownerHash: owner })),
            }));
          } catch {
            return json(503, { code: "committee.worker_unavailable", message: "Worker invocation failed" });
          }
        } else if (deps?.evaluationExecutor) {
          deps.evaluationExecutor.execute(admitted.jobId, owner).catch(() => {});
        }

        return json(202, {
          jobId: admitted.jobId,
          status: admitted.status,
          stateRevision: admitted.stateRevision,
          idempotent: admitted.idempotent,
          note: "Evaluación central admitida.",
        });
      } catch (err: unknown) {
        if (err instanceof SlotBusyError) {
          return json(409, { code: "committee.slot_busy", message: err.message });
        }
        if (err instanceof QuotaExhaustedError) {
          return json(429, { code: "committee.quota_exceeded", message: err.message });
        }
        if (err instanceof IdempotencyConflictError) {
          return json(409, { code: "committee.idempotency_conflict", message: err.message });
        }
        const msg = (err as Error).message ?? "";
        if (msg.includes("Approved policy not found") || msg.includes("Invalid")) {
          return json(400, { code: "committee.invalid_request", message: msg });
        }
        return json(503, { code: "committee.storage_unavailable", message: "Service unavailable" });
      }
    }

    // GET /api/committee/evaluations/{jobId}/report
    if (request.method === "GET" && parts.length === 5 && parts[4] === "report") {
      const admission = getAdmissionService();
      const store = getEvaluationStore();
      if (!admission || !store) {
        return json(503, { code: "committee.storage_unavailable", message: "Storage unavailable" });
      }
      try {
        const job = await admission.getJob(parts[3], owner);
        if (!job || !job.evaluation) {
          return json(404, { code: "committee.not_found", message: "Evaluation not found" });
        }
        if (job.status !== "completed") {
          return json(409, { code: "committee.evaluation_in_progress", message: "Evaluation is still in progress" });
        }
        const scenarioHash = hashPayload(job.scenario);
        const identity: EvaluationIdentity = {
          ownerHash: owner,
          jobId: parts[3],
          registryVersion: job.evaluation.registryVersion,
          artifactHash: job.evaluation.artifactHash,
          scenarioHash,
        };
        const report = await store.getReport(identity);
        if (!report) {
          return json(404, { code: "committee.not_found", message: "Report not found" });
        }
        return json(200, { jobId: parts[3], ...report });
      } catch (err: unknown) {
        if (err instanceof JobNotFoundError) {
          return json(404, { code: "committee.not_found", message: "Evaluation not found" });
        }
        return json(503, { code: "committee.storage_unavailable", message: "Storage unavailable" });
      }
    }

    // GET /api/committee/evaluations/{jobId}
    if (request.method === "GET" && parts.length === 4) {
      const evalService = getEvalService();
      if (!evalService) {
        return json(503, { code: "committee.evaluation_unavailable", message: "Central evaluation is not available" });
      }
      try {
        const status = await evalService.status(parts[3], owner);
        return json(200, {
          jobId: status.jobId,
          status: status.status,
          stateRevision: status.stateRevision,
          cancelRequested: Boolean(status.cancelRequested),
          evaluation: status.evaluation,
        });
      } catch (err: unknown) {
        if (err instanceof JobNotFoundError) {
          return json(404, { code: "committee.not_found", message: "Evaluation not found" });
        }
        return json(503, { code: "committee.storage_unavailable", message: "Storage error" });
      }
    }

    // DELETE /api/committee/evaluations/{jobId}
    if (request.method === "DELETE" && parts.length === 4) {
      const admission = getAdmissionService();
      if (!admission) {
        return json(503, { code: "committee.evaluation_unavailable", message: "Central evaluation is not available" });
      }
      try {
        const cancelled = await admission.requestCancel(parts[3], owner);
        return json(200, {
          jobId: cancelled.jobId,
          status: cancelled.status,
          stateRevision: cancelled.stateRevision,
          cancelRequested: Boolean(cancelled.cancelRequested),
        });
      } catch (err: unknown) {
        if (err instanceof JobNotFoundError) {
          return json(404, { code: "committee.not_found", message: "Evaluation not found" });
        }
        return json(503, { code: "committee.storage_unavailable", message: "Storage error" });
      }
    }
  }

  // 4. Preview jobs
  if (request.method === "POST" && url.pathname === "/api/committee/jobs") {
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      return json(400, { code: "committee.invalid_request", message: "Invalid JSON" });
    }
    if (forbidden.some((key) => key in body)) {
      return json(400, { code: "committee.invalid_request", message: "Internal search fields are rejected" });
    }
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    if (idempotencyKey.length < 8) {
      return json(400, { code: "committee.invalid_request", message: "Idempotency-Key is required" });
    }
    const horizonDays = Number(body.horizonDays ?? 40);
    const baseSeed = Number(body.seed ?? 20261030);
    const workerName = env.COMMITTEE_WORKER_FUNCTION_NAME;
    if (workerName && !run) {
      const jobId = crypto.randomUUID();
      try {
        await new LambdaClient({}).send(new InvokeCommand({
          FunctionName: workerName,
          InvocationType: "Event",
          Payload: Buffer.from(JSON.stringify({ jobId, ownerHash: owner, horizonDays, baseSeed })),
        }));
      } catch {
        return json(503, { code: "committee.worker_unavailable", message: "Preview worker unavailable" });
      }
      return json(202, {
        jobId,
        status: "queued",
        stateRevision: 1,
        recommendedPolicyVersion: 0,
        finalAudit: "not-run",
        baselineMean: null,
        candidateMean: null,
        note: "El worker de Comité recibió la búsqueda. El entrenamiento global sigue apagado; esta corrida es la vista previa.",
      });
    }
    const started = startCommitteeJob({
      ownerHash: owner,
      idempotencyKey,
      horizonDays,
      baseSeed,
      run,
    });
    if ("error" in started) {
      const code = started.error === "slot" ? "committee.slot_busy" : "committee.invalid_request";
      return json(started.error === "slot" ? 409 : 400, { code, message: started.error });
    }
    return json(202, {
      jobId: started.id,
      status: started.status,
      stateRevision: started.stateRevision,
      recommendedPolicyVersion: started.result.recommendedPolicyVersion,
      finalAudit: started.result.finalAudit,
      baselineMean: started.result.baselineMean,
      candidateMean: started.result.candidateMean,
      note: started.result.note,
    });
  }

  const jobId = parts[3];
  if (!jobId) return json(404, { code: "committee.not_found", message: "Not found" });
  let stored: Awaited<ReturnType<typeof loadCommitteeResult>>;
  try {
    stored = await resultReader(owner, jobId);
  } catch {
    return json(503, { code: "committee.storage_unavailable", message: "Committee storage unavailable" });
  }
  if (stored && parts[4] === "playback") {
    const day = Number(parts[5]);
    const snapshot = stored.result.playback[day];
    if (!snapshot) return json(404, { code: "committee.not_found", message: "Not found" });
    return json(200, { day, snapshot, policyVersion: stored.result.recommendedPolicyVersion });
  }
  if (stored && request.method === "GET") {
    return json(200, {
      jobId: stored.jobId,
      status: stored.result.status,
      stateRevision: stored.result.stateRevision,
      recommendedPolicyVersion: stored.result.recommendedPolicyVersion,
      finalAudit: stored.result.finalAudit,
      baselineMean: stored.result.baselineMean,
      candidateMean: stored.result.candidateMean,
      note: stored.result.note,
    });
  }
  if (parts[4] === "playback") {
    const day = Number(parts[5]);
    const job = readCommitteeJob(owner, jobId);
    if (!job) return json(404, { code: "committee.not_found", message: "Not found" });
    const snapshot = job.result.playback[day];
    if (!snapshot) return json(404, { code: "committee.not_found", message: "Not found" });
    return json(200, { day, snapshot, policyVersion: job.result.recommendedPolicyVersion });
  }
  if (request.method === "DELETE") {
    const job = cancelCommitteeJob(owner, jobId);
    if (!job) return json(404, { code: "committee.not_found", message: "Not found" });
    return json(200, publicJob(job));
  }
  if (request.method === "GET") {
    const job = readCommitteeJob(owner, jobId);
    if (!job) return json(404, { code: "committee.not_found", message: "Not found" });
    return json(200, publicJob(job));
  }
  return json(404, { code: "committee.not_found", message: "Not found" });
}

function publicJob(job: ReturnType<typeof readCommitteeJob> & object) {
  return {
    jobId: job.id,
    status: job.status,
    stateRevision: job.stateRevision,
    recommendedPolicyVersion: job.result.recommendedPolicyVersion,
    finalAudit: job.result.finalAudit,
    baselineMean: job.result.baselineMean,
    candidateMean: job.result.candidateMean,
    note: job.result.note,
  };
}
