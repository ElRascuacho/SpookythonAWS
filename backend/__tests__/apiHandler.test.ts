import { describe, expect, it, beforeEach } from "bun:test";
import { createApiHandler, ApiHandlerDependencies } from "../handlers/apiHandler";
import { InMemoryDatabase } from "../storage/inMemoryDatabase";
import { S3StorageService } from "../storage/s3Client";
import { InvitationService } from "../auth/invitationService";
import { SessionService } from "../auth/sessionService";
import { JobAdmissionService } from "../services/jobAdmissionService";
import { JobQueryService } from "../services/jobQueryService";

describe("API Handler Router (/api/v1/*)", () => {
  let db: InMemoryDatabase;
  let s3: S3StorageService;
  let invitationService: InvitationService;
  let sessionService: SessionService;
  let jobAdmissionService: JobAdmissionService;
  let jobQueryService: JobQueryService;
  let handler: (req: Request) => Promise<Response>;

  beforeEach(() => {
    db = new InMemoryDatabase();
    s3 = new S3StorageService({ bucketName: "test-bucket", localMode: true });
    invitationService = new InvitationService(db);
    sessionService = new SessionService(db, invitationService);
    jobAdmissionService = new JobAdmissionService(db);
    jobQueryService = new JobQueryService(db);

    const deps: ApiHandlerDependencies = {
      db,
      s3,
      invitationService,
      sessionService,
      jobAdmissionService,
      jobQueryService,
    };
    handler = createApiHandler(deps);
  });

  it("handles POST /api/v1/auth/session and issues secure cookie", async () => {
    const inv = await invitationService.createInvitation({ label: "Jurado API" });

    const req = new Request("https://api.internal/api/v1/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: inv.code }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);

    const cookie = res.headers.get("set-cookie");
    expect(cookie).toContain("spk_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.invitationId).toBe(inv.invitationId);
  });

  it("rejects POST /api/v1/auth/session with invalid code with 401", async () => {
    const req = new Request("https://api.internal/api/v1/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "SPK-0000-0000-0000-0000-0000" }),
    });

    const res = await handler(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });

  it("handles GET /api/v1/auth/session and DELETE /api/v1/auth/session", async () => {
    const inv = await invitationService.createInvitation({ label: "Jurado" });
    const session = await sessionService.createSession(inv.invitationId, inv.codeHash);
    const cookieHeader = `spk_session=${session.token}`;

    // Verify session
    const checkReq = new Request("https://api.internal/api/v1/auth/session", {
      method: "GET",
      headers: { cookie: cookieHeader },
    });
    const checkRes = await handler(checkReq);
    expect(checkRes.status).toBe(200);

    // Logout
    const logoutReq = new Request("https://api.internal/api/v1/auth/session", {
      method: "DELETE",
      headers: { cookie: cookieHeader },
    });
    const logoutRes = await handler(logoutReq);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("protects /api/v1/jobs against unauthenticated requests", async () => {
    const req = new Request("https://api.internal/api/v1/jobs", {
      method: "GET",
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it("creates and queries jobs with valid session cookie", async () => {
    const inv = await invitationService.createInvitation({ label: "Jurado" });
    const session = await sessionService.createSession(inv.invitationId, inv.codeHash);
    const cookieHeader = `spk_session=${session.token}`;

    // Create job
    const createReq = new Request("https://api.internal/api/v1/jobs", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        "Content-Type": "application/json",
        "Idempotency-Key": "key-api-01",
      },
      body: JSON.stringify({
        params: { days: 30, monteCarloRuns: 50 },
        visibility: "PRIVATE",
      }),
    });

    const createRes = await handler(createReq);
    expect(createRes.status).toBe(202);
    const createData = await createRes.json();
    expect(createData.ok).toBe(true);
    expect(createData.jobId).toBeDefined();

    // List own jobs
    const listReq = new Request("https://api.internal/api/v1/jobs", {
      method: "GET",
      headers: { cookie: cookieHeader },
    });
    const listRes = await handler(listReq);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.jobs.length).toBe(1);
    expect(listData.jobs[0].jobId).toBe(createData.jobId);

    // Get job status
    const statusReq = new Request(`https://api.internal/api/v1/jobs/${createData.jobId}`, {
      method: "GET",
      headers: { cookie: cookieHeader },
    });
    const statusRes = await handler(statusReq);
    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json();
    expect(statusData.job.jobId).toBe(createData.jobId);

    // Patch visibility to SHARED_INVITEES
    const patchReq = new Request(`https://api.internal/api/v1/jobs/${createData.jobId}`, {
      method: "PATCH",
      headers: {
        cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ visibility: "SHARED_INVITEES" }),
    });
    const patchRes = await handler(patchReq);
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.job.visibility).toBe("SHARED_INVITEES");

    // List shared jobs
    const sharedReq = new Request("https://api.internal/api/v1/jobs/shared", {
      method: "GET",
      headers: { cookie: cookieHeader },
    });
    const sharedRes = await handler(sharedReq);
    expect(sharedRes.status).toBe(200);
    const sharedData = await sharedRes.json();
    expect(sharedData.jobs.length).toBe(1);
  });
});
