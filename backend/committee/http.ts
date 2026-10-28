import { json, ownerHash } from "../auth";
import { cancelCommitteeJob, readCommitteeJob, startCommitteeJob } from "./jobStore";
import type { CommitteeRunRequest, CommitteeRunResult } from "../../src/domain/committee/runner";

const forbidden = ["pools", "weights", "candidates", "quotas", "trainIndices"];

export async function handleCommitteeRoute(
  request: Request,
  env: Record<string, string | undefined> = process.env,
  run?: (request: CommitteeRunRequest) => CommitteeRunResult,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/committee/")) return null;
  const owner = ownerHash(request, env);
  if (!owner) return json(401, { code: "auth.unauthorized", message: "Unauthorized" });

  const parts = url.pathname.split("/").filter(Boolean);
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
    const started = startCommitteeJob({
      ownerHash: owner,
      idempotencyKey,
      horizonDays: Number(body.horizonDays ?? 40),
      baseSeed: Number(body.seed ?? 20261030),
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
