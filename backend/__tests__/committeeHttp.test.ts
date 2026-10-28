import { describe, expect, test } from "bun:test";
import { authorize, hashInvitation } from "../auth";
import { handleCommitteeRoute } from "../committee/http";
import { resetCommitteeJobs } from "../committee/jobStore";
import { CommitteeAdmissionService } from "../committee/admissionService";
import { EvaluationJobService } from "../committee/evaluationJobService";
import { EvaluationStore } from "../committee/evaluationStore";
import { PolicyRegistry } from "../committee/policyRegistry";
import { trainOffline } from "../../src/domain/committee/offline";
import { InMemoryDynamoDBClient } from "./committee/inMemoryDynamoClient";
import type { CommitteeRunResult } from "../../src/domain/committee/runner";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const code = "MC-01234-56789-ABCDE-F0123";
const env = {
  INVITE_CODE_HASHES: hashInvitation(code),
  INVITE_SESSION_SECRET: "ab".repeat(32),
  INVITE_APP_ORIGIN: "https://manta.example",
};
const now = Date.now();

let ipCounter = 1;
async function sessionCookie() {
  const ip = `127.0.0.${ipCounter++}`;
  const response = await authorize(
    new Request(`${env.INVITE_APP_ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { origin: env.INVITE_APP_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }),
    ip,
    env,
    now,
  );
  return response!.headers.get("set-cookie")!.split(";")[0];
}

function fakeS3() {
  const objects = new Map<string, string>();
  return {
    objects,
    async send(command: any): Promise<any> {
      const input = command.input;
      if (command instanceof PutObjectCommand) {
        if (input.IfNoneMatch === "*" && objects.has(input.Key)) {
          throw Object.assign(new Error("exists"), { name: "PreconditionFailed" });
        }
        objects.set(input.Key, input.Body);
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const value = objects.get(input.Key);
        if (!value) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        return { Body: { transformToString: async () => value } };
      }
      throw new Error(`Unexpected command: ${command.constructor?.name}`);
    },
  };
}

const preview: CommitteeRunResult = {
  status: "completed",
  stateRevision: 2,
  recommendedPolicyVersion: 0,
  finalAudit: "not-run",
  weights: [0, 0, 0, 0],
  baselineMean: 10,
  candidateMean: 9,
  trajectories: 3,
  playback: [{
    day: 0,
    totalS: 1,
    totalE: 0,
    totalI: 0,
    totalR: 0,
    cumulativeInfected: 0,
    effectiveGamma: 0.1,
    hospitalCollapsed: false,
    nodes: {},
    action: {
      day: 0,
      vaccinatedNodes: {},
      fumigatedNodes: [],
      cordonedNodes: [],
      cordonedEdges: [],
      budgetSpent: 0,
      summaryText: "Sin intervención.",
    },
  }],
  note: "preview",
};

describe("committee http", () => {
  test("rejects internal search fields and hides foreign jobs", async () => {
    resetCommitteeJobs();
    const cookie = await sessionCookie();
    const rejected = await handleCommitteeRoute(
      new Request("https://manta.example/api/committee/jobs", {
        method: "POST",
        headers: { cookie, "Idempotency-Key": "same-key-1", "Content-Type": "application/json" },
        body: JSON.stringify({ horizonDays: 40, pools: [1] }),
      }),
      env,
      () => preview,
    );
    expect(rejected!.status).toBe(400);

    const created = await handleCommitteeRoute(
      new Request("https://manta.example/api/committee/jobs", {
        method: "POST",
        headers: { cookie, "Idempotency-Key": "same-key-1", "Content-Type": "application/json" },
        body: JSON.stringify({ horizonDays: 40, seed: 20261030 }),
      }),
      env,
      () => preview,
    );
    expect(created!.status).toBe(202);
    const body = await created!.json();
    const other = await handleCommitteeRoute(
      new Request(`https://manta.example/api/committee/jobs/${body.jobId}`, {
        headers: { cookie: "manta_session=nope" },
      }),
      env,
    );
    expect(other!.status).toBe(401);
  });
});

test("training remains disabled and latest policy requires authentication", async () => {
  const cookie = await sessionCookie();
  const unauthorized = await handleCommitteeRoute(new Request("https://manta.example/api/committee/policies/latest"), env);
  expect(unauthorized!.status).toBe(401);
  const disabled = await handleCommitteeRoute(new Request("https://manta.example/api/committee/training/jobs", { method: "POST", headers: { cookie } }), { ...env, COMMITTEE_TRAINING_ENABLED: "true" });
  expect(disabled!.status).toBe(503);
  expect((await disabled!.json()).code).toBe("committee.training_unavailable");
  const unavailable = await handleCommitteeRoute(new Request("https://manta.example/api/committee/policies/latest", { headers: { cookie } }), env);
  expect(unavailable!.status).toBe(503);
});

test("latest policy returns not found separately from registry failures", async () => {
  const cookie = await sessionCookie();
  const request = () => new Request("https://manta.example/api/committee/policies/latest", { headers: { cookie } });
  expect((await handleCommitteeRoute(request(), env, undefined, { latest: async () => null }))!.status).toBe(404);
  expect((await handleCommitteeRoute(request(), env, undefined, { latest: async () => { throw new Error("denied"); } }))!.status).toBe(503);
  const record = { registryVersion: "test" } as any;
  const response = await handleCommitteeRoute(request(), env, undefined, { latest: async () => record });
  expect(response!.status).toBe(200);
  expect(await response!.json()).toEqual(record);
});

test("storage failure returns controlled service unavailable", async () => {
  const cookie = await sessionCookie();
  const response = await handleCommitteeRoute(new Request("https://manta.example/api/committee/jobs/job-a", { headers: { cookie } }), env, undefined, undefined, async () => { throw new Error("storage failure"); });
  expect(response!.status).toBe(503);
  expect((await response!.json()).code).toBe("committee.storage_unavailable");
});

test("central evaluation remains fail-closed without a durable worker", async () => {
  const cookie = await sessionCookie();
  expect((await handleCommitteeRoute(new Request("https://manta.example/api/committee/evaluations", { method: "POST" }), env))!.status).toBe(401);
  const response = await handleCommitteeRoute(new Request("https://manta.example/api/committee/evaluations", { method: "POST", headers: { cookie }, body: "{}" }), env);
  expect(response!.status).toBe(503);
  expect((await response!.json()).code).toBe("committee.evaluation_unavailable");
});

describe("central evaluation and training lifecycle routes", () => {
  test("evaluations: input validation, admission, status, cancellation, and report download", async () => {
    const cookie = await sessionCookie();
    const ddb = new InMemoryDynamoDBClient() as unknown as DynamoDBClient;
    const s3 = fakeS3();
    const admission = new CommitteeAdmissionService(ddb, "test-committee-table");
    const registry = new PolicyRegistry(s3 as any, "test-bucket");
    const store = new EvaluationStore(s3 as any, "test-bucket");
    const evaluationJobService = new EvaluationJobService(admission, registry);

    const training = trainOffline({
      jobId: "test-offline-run",
      baseSeed: 42,
      horizonDays: 20,
      simulate: ({ policy, weights }) => ({
        totalCumulativeInfected: policy === "weighted" ? 100 - (weights?.[0] ?? 0) * 10 : 120,
        timeline: [],
      }),
    });
    const published = await registry.publish(training, new Date("2026-10-28T12:00:00Z"), "v1-approved");

    const deps = {
      admissionService: admission,
      evaluationJobService,
      evaluationStore: store,
    };

    // 1. Missing Idempotency-Key
    const badKey = await handleCommitteeRoute(
      new Request("https://manta.example/api/committee/evaluations", {
        method: "POST",
        headers: { cookie, "Idempotency-Key": "short", "Content-Type": "application/json" },
        body: JSON.stringify({ registryVersion: "v1-approved", seed: 1234 }),
      }),
      env,
      undefined,
      undefined,
      undefined,
      deps,
    );
    expect(badKey!.status).toBe(400);

    // 2. Unapproved / non-existent policy
    const badPolicy = await handleCommitteeRoute(
      new Request("https://manta.example/api/committee/evaluations", {
        method: "POST",
        headers: { cookie, "Idempotency-Key": "valid-key-1", "Content-Type": "application/json" },
        body: JSON.stringify({ registryVersion: "2026-10-28T12:00:00.000Z_unknown-v99", seed: 1234 }),
      }),
      env,
      undefined,
      undefined,
      undefined,
      deps,
    );
    expect(badPolicy!.status).toBe(400);
    expect((await badPolicy!.json()).message).toContain("Approved policy not found");

    // 3. Successful admission
    const admitted = await handleCommitteeRoute(
      new Request("https://manta.example/api/committee/evaluations", {
        method: "POST",
        headers: { cookie, "Idempotency-Key": "valid-key-1", "Content-Type": "application/json" },
        body: JSON.stringify({ registryVersion: published.registryVersion, seed: 1234, plannedPairs: 4 }),
      }),
      env,
      undefined,
      undefined,
      undefined,
      deps,
    );
    expect(admitted!.status).toBe(202);
    const admittedBody = await admitted!.json();
    expect(admittedBody.jobId).toBeDefined();
    expect(admittedBody.status).toBe("queued");
    expect(admittedBody.idempotent).toBe(false);

    // 4. Idempotent retry returns same job
    const idem = await handleCommitteeRoute(
      new Request("https://manta.example/api/committee/evaluations", {
        method: "POST",
        headers: { cookie, "Idempotency-Key": "valid-key-1", "Content-Type": "application/json" },
        body: JSON.stringify({ registryVersion: published.registryVersion, seed: 1234, plannedPairs: 4 }),
      }),
      env,
      undefined,
      undefined,
      undefined,
      deps,
    );
    expect(idem!.status).toBe(202);
    expect((await idem!.json()).idempotent).toBe(true);

    // 5. Query status via GET
    const statusRes = await handleCommitteeRoute(
      new Request(`https://manta.example/api/committee/evaluations/${admittedBody.jobId}`, {
        method: "GET",
        headers: { cookie },
      }),
      env,
      undefined,
      undefined,
      undefined,
      deps,
    );
    expect(statusRes!.status).toBe(200);
    const statusBody = await statusRes!.json();
    expect(statusBody.jobId).toBe(admittedBody.jobId);
    expect(statusBody.status).toBe("queued");
    expect(statusBody.evaluation.plannedPairs).toBe(4);
    expect(statusBody.evaluation.completedPairs).toBe(0);

    // 6. Report before completion returns 409 Conflict
    const earlyReport = await handleCommitteeRoute(
      new Request(`https://manta.example/api/committee/evaluations/${admittedBody.jobId}/report`, {
        method: "GET",
        headers: { cookie },
      }),
      env,
      undefined,
      undefined,
      undefined,
      deps,
    );
    expect(earlyReport!.status).toBe(409);
    expect((await earlyReport!.json()).code).toBe("committee.evaluation_in_progress");

    // 7. Request cancellation via DELETE
    const cancelRes = await handleCommitteeRoute(
      new Request(`https://manta.example/api/committee/evaluations/${admittedBody.jobId}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      env,
      undefined,
      undefined,
      undefined,
      deps,
    );
    expect(cancelRes!.status).toBe(200);
    const cancelBody = await cancelRes!.json();
    expect(cancelBody.cancelRequested).toBe(true);
  });

  test("training jobs: admits job when feature flag is enabled and rejects when slot is busy", async () => {
    const cookie = await sessionCookie();
    const ddb = new InMemoryDynamoDBClient() as unknown as DynamoDBClient;
    const admission = new CommitteeAdmissionService(ddb, "test-training-table");

    const enabledEnv = {
      ...env,
      COMMITTEE_TRAINING_ENABLED: "true",
    };

    // Successful training admission
    const admitted = await handleCommitteeRoute(
      new Request("https://manta.example/api/committee/training/jobs", {
        method: "POST",
        headers: { cookie, "Idempotency-Key": "train-key-01", "Content-Type": "application/json" },
        body: JSON.stringify({ horizonDays: 40, seed: 100 }),
      }),
      enabledEnv,
      undefined,
      undefined,
      undefined,
      { admissionService: admission },
    );
    expect(admitted!.status).toBe(202);
    const body = await admitted!.json();
    expect(body.status).toBe("queued");

    // Second caller tries concurrently -> 409 slot busy
    const busy = await handleCommitteeRoute(
      new Request("https://manta.example/api/committee/training/jobs", {
        method: "POST",
        headers: { cookie, "Idempotency-Key": "train-key-02", "Content-Type": "application/json" },
        body: JSON.stringify({ horizonDays: 40, seed: 200 }),
      }),
      enabledEnv,
      undefined,
      undefined,
      undefined,
      { admissionService: admission },
    );
    expect(busy!.status).toBe(409);
    expect((await busy!.json()).code).toBe("committee.slot_busy");
  });
});
