import { describe, expect, test } from "bun:test";
import { authorize, hashInvitation } from "../auth";
import { handleCommitteeRoute } from "../committee/http";
import { resetCommitteeJobs } from "../committee/jobStore";
import type { CommitteeRunResult } from "../../src/domain/committee/runner";

const code = "MC-01234-56789-ABCDE-F0123";
const env = {
  INVITE_CODE_HASHES: hashInvitation(code),
  INVITE_SESSION_SECRET: "ab".repeat(32),
  INVITE_APP_ORIGIN: "https://manta.example",
};
const now = Date.now();

async function sessionCookie() {
  const response = await authorize(
    new Request(`${env.INVITE_APP_ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { origin: env.INVITE_APP_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }),
    "127.0.0.1",
    env,
    now,
  );
  return response!.headers.get("set-cookie")!.split(";")[0];
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
