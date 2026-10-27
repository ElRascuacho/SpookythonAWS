import { describe, expect, it, beforeEach } from "bun:test";
import { createApiHandler, ApiHandlerDependencies } from "../../backend/handlers/apiHandler";
import { InMemoryDatabase } from "../../backend/storage/inMemoryDatabase";
import { S3StorageService } from "../../backend/storage/s3Client";
import { InvitationService } from "../../backend/auth/invitationService";
import { SessionService } from "../../backend/auth/sessionService";
import { JobAdmissionService } from "../../backend/services/jobAdmissionService";
import { JobQueryService } from "../../backend/services/jobQueryService";

describe("E2E: Two Invitations Isolation & Shared Visibility Flow", () => {
  let db: InMemoryDatabase;
  let s3: S3StorageService;
  let invitationService: InvitationService;
  let sessionService: SessionService;
  let jobAdmissionService: JobAdmissionService;
  let jobQueryService: JobQueryService;
  let handler: (req: Request) => Promise<Response>;

  beforeEach(() => {
    db = new InMemoryDatabase();
    s3 = new S3StorageService({ bucketName: "e2e-bucket", localMode: true });
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

  it("proves complete isolation, concurrency slot enforcement, and controlled sharing between two users", async () => {
    // 1. Admin creates two separate invitations
    const invUser1 = await invitationService.createInvitation({ label: "Jurado A" });
    const invUser2 = await invitationService.createInvitation({ label: "Jurado B" });

    // 2. User 1 logs in
    const loginRes1 = await handler(
      new Request("https://api.internal/api/v1/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: invUser1.code }),
      }),
    );
    expect(loginRes1.status).toBe(200);
    const cookieUser1 = loginRes1.headers.get("set-cookie")!.split(";")[0];

    // 3. User 2 logs in
    const loginRes2 = await handler(
      new Request("https://api.internal/api/v1/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: invUser2.code }),
      }),
    );
    expect(loginRes2.status).toBe(200);
    const cookieUser2 = loginRes2.headers.get("set-cookie")!.split(";")[0];

    // 4. User 1 submits a PRIVATE simulation job
    const createRes = await handler(
      new Request("https://api.internal/api/v1/jobs", {
        method: "POST",
        headers: {
          cookie: cookieUser1,
          "Content-Type": "application/json",
          "Idempotency-Key": "user1-job-1",
        },
        body: JSON.stringify({
          params: { days: 25, monteCarloRuns: 25 },
          visibility: "PRIVATE",
        }),
      }),
    );
    expect(createRes.status).toBe(202);
    const createData = await createRes.json();
    const jobId1 = createData.jobId;

    // 5. User 1 cannot launch a second concurrent job while first is running (concurrency limit = 1)
    const concurrentRes = await handler(
      new Request("https://api.internal/api/v1/jobs", {
        method: "POST",
        headers: {
          cookie: cookieUser1,
          "Content-Type": "application/json",
          "Idempotency-Key": "user1-job-2",
        },
        body: JSON.stringify({
          params: { days: 20 },
          visibility: "PRIVATE",
        }),
      }),
    );
    expect(concurrentRes.status).toBe(409);

    // 6. User 2 attempts to query User 1's private job -> must receive 404
    const forbiddenRes = await handler(
      new Request(`https://api.internal/api/v1/jobs/${jobId1}`, {
        method: "GET",
        headers: { cookie: cookieUser2 },
      }),
    );
    expect(forbiddenRes.status).toBe(404);

    // 7. User 2 lists own jobs -> empty
    const listRes2 = await handler(
      new Request("https://api.internal/api/v1/jobs", {
        method: "GET",
        headers: { cookie: cookieUser2 },
      }),
    );
    const listData2 = await listRes2.json();
    expect(listData2.jobs.length).toBe(0);

    // 8. User 2 checks shared gallery -> empty (job 1 is private)
    const sharedBefore = await handler(
      new Request("https://api.internal/api/v1/jobs/shared", {
        method: "GET",
        headers: { cookie: cookieUser2 },
      }),
    );
    expect((await sharedBefore.json()).jobs.length).toBe(0);

    // 9. User 1 decides to share the job with other invitees
    const patchRes = await handler(
      new Request(`https://api.internal/api/v1/jobs/${jobId1}`, {
        method: "PATCH",
        headers: {
          cookie: cookieUser1,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ visibility: "SHARED_INVITEES" }),
      }),
    );
    expect(patchRes.status).toBe(200);

    // 10. User 2 now CAN see and inspect the shared job
    const sharedAfter = await handler(
      new Request("https://api.internal/api/v1/jobs/shared", {
        method: "GET",
        headers: { cookie: cookieUser2 },
      }),
    );
    const sharedData = await sharedAfter.json();
    expect(sharedData.jobs.length).toBe(1);
    expect(sharedData.jobs[0].jobId).toBe(jobId1);

    const inspectRes = await handler(
      new Request(`https://api.internal/api/v1/jobs/${jobId1}`, {
        method: "GET",
        headers: { cookie: cookieUser2 },
      }),
    );
    expect(inspectRes.status).toBe(200);
    expect((await inspectRes.json()).job.jobId).toBe(jobId1);

    // 11. Admin revokes User 1's invitation -> User 1's session immediately blocked
    await invitationService.revokeInvitation(invUser1.invitationId);
    const blockedRes = await handler(
      new Request("https://api.internal/api/v1/jobs", {
        method: "GET",
        headers: { cookie: cookieUser1 },
      }),
    );
    expect(blockedRes.status).toBe(401);

    // 12. User 2 is completely unaffected and continues working normally
    const normalRes2 = await handler(
      new Request("https://api.internal/api/v1/auth/session", {
        method: "GET",
        headers: { cookie: cookieUser2 },
      }),
    );
    expect(normalRes2.status).toBe(200);
  });
});
