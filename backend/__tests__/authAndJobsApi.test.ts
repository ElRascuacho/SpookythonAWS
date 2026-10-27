import { describe, expect, it, beforeEach } from "bun:test";
import {
  generateInvitationCode,
  generateSessionToken,
  hashSecret,
  safeCompare,
} from "../auth/crypto";
import {
  InvitationService,
  InvitationRecord,
} from "../auth/invitationService";
import { SessionService } from "../auth/sessionService";
import {
  createSessionCookieHeader,
  createClearSessionCookieHeader,
  parseSessionCookie,
} from "../auth/cookieHelper";
import { JobAdmissionService } from "../services/jobAdmissionService";
import { JobQueryService } from "../services/jobQueryService";
import { InMemoryDatabase } from "../storage/inMemoryDatabase";

describe("Task 02: Cryptographic & Token Helpers", () => {
  it("generates invitation codes with >= 128 bits of entropy matching format", () => {
    const code1 = generateInvitationCode();
    const code2 = generateInvitationCode();

    expect(code1).not.toBe(code2);
    expect(code1.length).toBeGreaterThanOrEqual(20);
    expect(code1).toMatch(/^SPK-[A-Z0-9]{4}(-[A-Z0-9]{4}){3,7}$/);
  });

  it("generates opaque session tokens with 256 bits of entropy in hex", () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).not.toBe(token2);
    expect(token1.startsWith("ses_")).toBe(true);
    // ses_ + 64 hex chars = 68 chars
    expect(token1.length).toBe(68);
    expect(token1.slice(4)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes secrets deterministically with SHA-256 and constant-time compares", () => {
    const secret = "test-secret-12345";
    const hash1 = hashSecret(secret);
    const hash2 = hashSecret(secret);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);

    expect(safeCompare(hash1, hash2)).toBe(true);
    expect(safeCompare(hash1, hashSecret("different"))).toBe(false);
  });
});

describe("Task 02: Invitation & Session Services", () => {
  let db: InMemoryDatabase;
  let invitationService: InvitationService;
  let sessionService: SessionService;

  beforeEach(() => {
    db = new InMemoryDatabase();
    invitationService = new InvitationService(db);
    sessionService = new SessionService(db, invitationService);
  });

  it("stores ZERO plain-text secrets in persistence, only SHA-256 hashes", async () => {
    const created = await invitationService.createInvitation({
      label: "Jurado Evaluador 1",
      maxJobsPerDay: 20,
    });

    expect(created.code).toBeDefined();
    // Verify database only has codeHash
    const lookupItem = await db.getItem(`CODE#${hashSecret(created.code)}`, "RESOLVE");
    expect(lookupItem).toBeDefined();
    expect(lookupItem?.invitationId).toBe(created.invitationId);

    const invItem = await db.getItem(`INV#${created.invitationId}`, "METADATA");
    expect(invItem).toBeDefined();
    expect(invItem?.codeHash).toBe(hashSecret(created.code));
    // Must NOT contain plain text code
    expect((invItem as any).code).toBeUndefined();
  });

  it("validates active invitation and returns uniform failure for non-existent, expired or revoked", async () => {
    const created = await invitationService.createInvitation({
      label: "Jurado Activo",
    });

    const validResult = await invitationService.validateInvitation(created.code);
    expect(validResult).not.toBeNull();
    expect(validResult?.invitationId).toBe(created.invitationId);
    expect(validResult?.status).toBe("ACTIVE");

    // Non-existent code
    const fakeCode = "SPK-0000-0000-0000-0000-0000";
    expect(await invitationService.validateInvitation(fakeCode)).toBeNull();

    // Revoked code
    await invitationService.revokeInvitation(created.invitationId);
    expect(await invitationService.validateInvitation(created.code)).toBeNull();
  });

  it("rejects expired invitations even before DB TTL cleanup", async () => {
    // Expired invitation created in the past
    const created = await invitationService.createInvitation({
      label: "Invitación Pasada",
      expiresInDays: -1, // already expired
    });

    expect(await invitationService.validateInvitation(created.code)).toBeNull();
  });

  it("creates and verifies opaque sessions checking both token and owning invitation", async () => {
    const created = await invitationService.createInvitation({ label: "Invitado" });
    const session = await sessionService.createSession(created.invitationId, hashSecret(created.code));

    expect(session.token).toMatch(/^ses_[0-9a-f]{64}$/);

    const verified = await sessionService.verifySession(session.token);
    expect(verified).not.toBeNull();
    expect(verified?.invitationId).toBe(created.invitationId);

    // If owning invitation is revoked, session verification fails immediately
    await invitationService.revokeInvitation(created.invitationId);
    expect(await sessionService.verifySession(session.token)).toBeNull();
  });

  it("revokes session on logout", async () => {
    const created = await invitationService.createInvitation({ label: "Invitado Logout" });
    const session = await sessionService.createSession(created.invitationId, hashSecret(created.code));

    expect(await sessionService.verifySession(session.token)).not.toBeNull();
    await sessionService.revokeSession(session.token);
    expect(await sessionService.verifySession(session.token)).toBeNull();
  });
});

describe("Task 02: Cookie Helper", () => {
  it("formats HttpOnly; Secure; SameSite=Strict cookie header", () => {
    const token = "ses_abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const cookie = createSessionCookieHeader(token);

    expect(cookie).toContain(`spk_session=${token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/v1");
    expect(cookie).toContain("Max-Age=43200");
  });

  it("creates clear cookie header on logout with Max-Age=0", () => {
    const clearCookie = createClearSessionCookieHeader();
    expect(clearCookie).toContain("spk_session=");
    expect(clearCookie).toContain("Max-Age=0");
  });

  it("parses session cookie from cookie string", () => {
    const token = "ses_1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff";
    const header = `other_cookie=xyz; spk_session=${token}; theme=dark`;
    expect(parseSessionCookie(header)).toBe(token);
    expect(parseSessionCookie("")).toBeNull();
    expect(parseSessionCookie(undefined)).toBeNull();
  });
});

describe("Task 02: Job Admission Service & Atomic Invariants", () => {
  let db: InMemoryDatabase;
  let invitationService: InvitationService;
  let jobAdmissionService: JobAdmissionService;
  let activeInv: InvitationRecord;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    invitationService = new InvitationService(db);
    jobAdmissionService = new JobAdmissionService(db);

    const created = await invitationService.createInvitation({
      label: "Test Jurado",
      maxJobsPerDay: 20,
    });
    activeInv = (await invitationService.validateInvitation(created.code))!;
  });

  it("admits job with atomic transaction initializing attempt=1 and slotReleased=false", async () => {
    const result = await jobAdmissionService.admitJob({
      invitationId: activeInv.invitationId,
      params: { days: 30, monteCarloRuns: 50 },
      enableAiStrategy: false,
      visibility: "PRIVATE",
      idempotencyKey: "req-key-1",
    });

    expect(result.jobId).toBeDefined();
    expect(result.status).toBe("PENDING");
    expect(result.idempotent).toBe(false);

    const jobItem = await db.getItem(`JOB#${result.jobId}`, "METADATA");
    expect(jobItem).toBeDefined();
    expect(jobItem?.status).toBe("PENDING");
    expect(jobItem?.slotReleased).toBe(false);
    expect(jobItem?.attempt).toBe(1);
    expect(jobItem?.GSI3PK).toBe("STATUS#PENDING");
  });

  it("rejects concurrent job if caller already has an active job (activeJobsCount >= 1)", async () => {
    await jobAdmissionService.admitJob({
      invitationId: activeInv.invitationId,
      params: { days: 30 },
      enableAiStrategy: false,
      visibility: "PRIVATE",
      idempotencyKey: "first-job",
    });

    // Second job must be rejected because slot is occupied (activeJobsCount = 1)
    await expect(
      jobAdmissionService.admitJob({
        invitationId: activeInv.invitationId,
        params: { days: 45 },
        enableAiStrategy: false,
        visibility: "PRIVATE",
        idempotencyKey: "second-job",
      }),
    ).rejects.toThrow(/slot activo ocupado|active job already running/i);
  });

  it("handles idempotency cleanly: same key & same payload returns existing job without consuming slot", async () => {
    const first = await jobAdmissionService.admitJob({
      invitationId: activeInv.invitationId,
      params: { days: 30 },
      enableAiStrategy: false,
      visibility: "PRIVATE",
      idempotencyKey: "idemp-001",
    });

    const duplicate = await jobAdmissionService.admitJob({
      invitationId: activeInv.invitationId,
      params: { days: 30 },
      enableAiStrategy: false,
      visibility: "PRIVATE",
      idempotencyKey: "idemp-001",
    });

    expect(duplicate.jobId).toBe(first.jobId);
    expect(duplicate.idempotent).toBe(true);
  });

  it("rejects idempotency key with conflicting different payload with 409", async () => {
    await jobAdmissionService.admitJob({
      invitationId: activeInv.invitationId,
      params: { days: 30 },
      enableAiStrategy: false,
      visibility: "PRIVATE",
      idempotencyKey: "idemp-conflict",
    });

    await expect(
      jobAdmissionService.admitJob({
        invitationId: activeInv.invitationId,
        params: { days: 60 }, // different params
        enableAiStrategy: false,
        visibility: "PRIVATE",
        idempotencyKey: "idemp-conflict",
      }),
    ).rejects.toThrow(/conflicto de idempotencia|payload mismatch/i);
  });

  it("enforces per-invitation daily quota (max 20)", async () => {
    // Manually set quota near limit
    const today = new Date().toISOString().slice(0, 10);
    await db.putItem({
      PK: `QUOTA#${activeInv.invitationId}#${today}`,
      SK: "COUNTER",
      jobCount: 20,
    });

    await expect(
      jobAdmissionService.admitJob({
        invitationId: activeInv.invitationId,
        params: { days: 10 },
        enableAiStrategy: false,
        visibility: "PRIVATE",
        idempotencyKey: "quota-test",
      }),
    ).rejects.toThrow(/cuota diaria.*invitación/i);
  });

  it("enforces global daily quota (max 100)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await db.putItem({
      PK: `GLOBAL_QUOTA#${today}`,
      SK: "COUNTER",
      jobCount: 100,
    });

    await expect(
      jobAdmissionService.admitJob({
        invitationId: activeInv.invitationId,
        params: { days: 10 },
        enableAiStrategy: false,
        visibility: "PRIVATE",
        idempotencyKey: "global-quota-test",
      }),
    ).rejects.toThrow(/cuota global diaria/i);
  });
});

describe("Task 02: Job Query Service & Shared Visibility", () => {
  let db: InMemoryDatabase;
  let invitationService: InvitationService;
  let jobAdmissionService: JobAdmissionService;
  let jobQueryService: JobQueryService;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    invitationService = new InvitationService(db);
    jobAdmissionService = new JobAdmissionService(db);
    jobQueryService = new JobQueryService(db);
  });

  it("lists own jobs and isolates private jobs from other callers", async () => {
    const userA = await invitationService.createInvitation({ label: "User A" });
    const userB = await invitationService.createInvitation({ label: "User B" });

    const jobA = await jobAdmissionService.admitJob({
      invitationId: userA.invitationId,
      params: { days: 20 },
      enableAiStrategy: false,
      visibility: "PRIVATE",
      idempotencyKey: "jobA",
    });

    const ownA = await jobQueryService.listOwnJobs(userA.invitationId);
    expect(ownA.length).toBe(1);
    expect(ownA[0].jobId).toBe(jobA.jobId);

    const ownB = await jobQueryService.listOwnJobs(userB.invitationId);
    expect(ownB.length).toBe(0);

    // userB querying jobA status should fail with not found
    await expect(
      jobQueryService.getJobStatus(jobA.jobId, userB.invitationId),
    ).rejects.toThrow(/no encontrado|not found/i);
  });

  it("allows shared gallery query with strong base-table verification", async () => {
    const userA = await invitationService.createInvitation({ label: "User A" });
    const userB = await invitationService.createInvitation({ label: "User B" });

    const jobShared = await jobAdmissionService.admitJob({
      invitationId: userA.invitationId,
      params: { days: 30 },
      enableAiStrategy: false,
      visibility: "SHARED_INVITEES",
      idempotencyKey: "jobShared",
    });

    const sharedList = await jobQueryService.listSharedJobs();
    expect(sharedList.length).toBe(1);
    expect(sharedList[0].jobId).toBe(jobShared.jobId);

    // userB CAN query status of shared job
    const status = await jobQueryService.getJobStatus(jobShared.jobId, userB.invitationId);
    expect(status.jobId).toBe(jobShared.jobId);
    expect(status.visibility).toBe("SHARED_INVITEES");
  });

  it("allows updating job visibility only by the job owner", async () => {
    const userA = await invitationService.createInvitation({ label: "User A" });
    const userB = await invitationService.createInvitation({ label: "User B" });

    const job = await jobAdmissionService.admitJob({
      invitationId: userA.invitationId,
      params: { days: 20 },
      enableAiStrategy: false,
      visibility: "PRIVATE",
      idempotencyKey: "jobToggle",
    });

    // User B cannot change visibility of user A's job
    await expect(
      jobQueryService.updateJobVisibility(job.jobId, userB.invitationId, "SHARED_INVITEES"),
    ).rejects.toThrow(/no autorizado|not owner/i);

    // User A can toggle it
    const updated = await jobQueryService.updateJobVisibility(job.jobId, userA.invitationId, "SHARED_INVITEES");
    expect(updated.visibility).toBe("SHARED_INVITEES");
  });
});
