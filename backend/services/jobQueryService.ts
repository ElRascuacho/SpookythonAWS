import { InMemoryDatabase } from "../storage/inMemoryDatabase";
import { JobSummaryItem, JobVisibility } from "../../src/domain/schemas/api.schema";

export class JobQueryService {
  constructor(private db: InMemoryDatabase) {}

  private mapToSummary(item: any): JobSummaryItem {
    return {
      jobId: item.jobId,
      status: item.status,
      createdAt: item.createdAt,
      totalRuns: item.totalRuns ?? 1500,
      strategies: item.strategies ?? ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"],
      visibility: item.visibility ?? "PRIVATE",
      attempt: item.attempt ?? 1,
      completedAt: item.completedAt,
      dueTimeIso: item.dueTimeIso,
    };
  }

  async listOwnJobs(invitationId: string): Promise<JobSummaryItem[]> {
    const items = await this.db.queryGSI1(`INV#${invitationId}`);
    return items.map((it) => this.mapToSummary(it));
  }

  async listSharedJobs(): Promise<JobSummaryItem[]> {
    const candidates = await this.db.queryGSI2("VISIBILITY#SHARED_INVITEES");
    const verifiedList: JobSummaryItem[] = [];

    // Protocol of Strong Re-verification on Base Table
    for (const cand of candidates) {
      const baseJob = await this.db.getItem(`JOB#${cand.jobId}`, "METADATA");
      if (!baseJob) continue;

      // Check visibility is still SHARED_INVITEES
      if (baseJob.visibility !== "SHARED_INVITEES") continue;

      // Check owner invitation is still ACTIVE
      const ownerInv = await this.db.getItem(`INV#${baseJob.invitationId}`, "METADATA");
      if (!ownerInv || ownerInv.status !== "ACTIVE") continue;

      verifiedList.push(this.mapToSummary(baseJob));
    }

    return verifiedList;
  }

  async getJobStatus(jobId: string, callerInvitationId: string): Promise<JobSummaryItem> {
    const job = await this.db.getItem(`JOB#${jobId}`, "METADATA");
    if (!job) {
      throw new Error("Trabajo no encontrado.");
    }

    const isOwner = job.invitationId === callerInvitationId;
    const isShared = job.visibility === "SHARED_INVITEES";

    if (!isOwner && !isShared) {
      throw new Error("Trabajo no encontrado o acceso no autorizado.");
    }

    return this.mapToSummary(job);
  }

  async updateJobVisibility(
    jobId: string,
    callerInvitationId: string,
    newVisibility: JobVisibility,
  ): Promise<JobSummaryItem> {
    const job = await this.db.getItem(`JOB#${jobId}`, "METADATA");
    if (!job || job.invitationId !== callerInvitationId) {
      throw new Error("No autorizado para modificar este trabajo.");
    }

    job.visibility = newVisibility;
    job.GSI2PK = `VISIBILITY#${newVisibility}`;

    await this.db.putItem(job);
    return this.mapToSummary(job);
  }

  async getJobResultsProxy(jobId: string, callerInvitationId: string): Promise<any> {
    const status = await this.getJobStatus(jobId, callerInvitationId);
    if (status.status !== "COMPLETED") {
      throw new Error(`El trabajo aún no ha finalizado (estado actual: ${status.status}).`);
    }

    const job = await this.db.getItem(`JOB#${jobId}`, "METADATA");
    return {
      ok: true,
      jobId,
      status: "COMPLETED",
      result: job?.resultsPayload ?? {},
      aiSummary: job?.aiSummary,
    };
  }
}
