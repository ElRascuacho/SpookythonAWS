import { describe, expect, it, beforeEach } from "bun:test";
import { reconcileStaleJobs, ReconcilerDependencies } from "../reconciliation/cleanupService";
import { InMemoryDatabase } from "../storage/inMemoryDatabase";
import { InvitationService } from "../auth/invitationService";
import { JobAdmissionService } from "../services/jobAdmissionService";

describe("Task 07: Scheduled Reconciler & Job Recovery", () => {
  let db: InMemoryDatabase;
  let invitationService: InvitationService;
  let jobAdmissionService: JobAdmissionService;

  beforeEach(() => {
    db = new InMemoryDatabase();
    invitationService = new InvitationService(db);
    jobAdmissionService = new JobAdmissionService(db);
  });

  it("leaves fresh jobs (< 15 min) untouched", async () => {
    const inv = await invitationService.createInvitation({ label: "Fresh Tester" });
    const job = await jobAdmissionService.admitJob({
      invitationId: inv.invitationId,
      params: { days: 20 },
    });

    const deps: ReconcilerDependencies = { db };
    const result = await reconcileStaleJobs(deps);

    expect(result.reconciledCount).toBe(0);

    const jobItem = await db.getItem(`JOB#${job.jobId}`, "METADATA");
    expect(jobItem?.status).toBe("PENDING");
    expect(jobItem?.slotReleased).toBe(false);

    const invItem = await db.getItem(`INV#${inv.invitationId}`, "METADATA");
    expect(invItem?.activeJobsCount).toBe(1);
  });

  it("reclaims stale jobs (> 15 min old), marks TIMED_OUT and frees concurrency slot", async () => {
    const inv = await invitationService.createInvitation({ label: "Stale Tester" });
    const job = await jobAdmissionService.admitJob({
      invitationId: inv.invitationId,
      params: { days: 20 },
    });

    // Artificially age the job past 15 min by modifying dueTimeIso to the past
    const pastTime = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
    const jobItem = await db.getItem(`JOB#${job.jobId}`, "METADATA");
    jobItem!.dueTimeIso = pastTime;
    jobItem!.GSI3SK = pastTime;
    await db.putItem(jobItem!);

    const deps: ReconcilerDependencies = { db };
    const result = await reconcileStaleJobs(deps);

    expect(result.reconciledCount).toBe(1);

    const updatedJob = await db.getItem(`JOB#${job.jobId}`, "METADATA");
    expect(updatedJob?.status).toBe("TIMED_OUT");
    expect(updatedJob?.slotReleased).toBe(true);
    expect(updatedJob?.closedBy).toBe("RECONCILER");
    expect(updatedJob?.GSI3PK).toBeUndefined(); // Removed from active GSI3 index

    // The user's slot is freed!
    const updatedInv = await db.getItem(`INV#${inv.invitationId}`, "METADATA");
    expect(updatedInv?.activeJobsCount).toBe(0);

    // User can now launch a new job without concurrency block
    const newJob = await jobAdmissionService.admitJob({
      invitationId: inv.invitationId,
      params: { days: 10 },
    });
    expect(newJob.jobId).toBeDefined();
    expect(newJob.status).toBe("PENDING");
  });

  it("ensures exactly-once slot release and never decrements activeJobsCount below 0", async () => {
    const inv = await invitationService.createInvitation({ label: "Tester" });
    const job = await jobAdmissionService.admitJob({
      invitationId: inv.invitationId,
      params: { days: 10 },
    });

    // Age the job
    const pastTime = new Date(Date.now() - 60000).toISOString();
    const jobItem = await db.getItem(`JOB#${job.jobId}`, "METADATA");
    jobItem!.dueTimeIso = pastTime;
    jobItem!.GSI3SK = pastTime;
    await db.putItem(jobItem!);

    const deps: ReconcilerDependencies = { db };

    // Run reconciler twice in succession
    const run1 = await reconcileStaleJobs(deps);
    expect(run1.reconciledCount).toBe(1);

    const run2 = await reconcileStaleJobs(deps);
    expect(run2.reconciledCount).toBe(0);

    const invItem = await db.getItem(`INV#${inv.invitationId}`, "METADATA");
    expect(invItem?.activeJobsCount).toBe(0);
  });
});
