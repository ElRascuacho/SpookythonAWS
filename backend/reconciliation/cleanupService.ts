import { InMemoryDatabase } from "../storage/inMemoryDatabase";

export interface ReconcilerDependencies {
  db: InMemoryDatabase;
  stepFunctionsClient?: {
    describeExecution: (arn: string) => Promise<{ status: string }>;
  };
}

export interface ReconcilerResult {
  reconciledCount: number;
  reconciledJobIds: string[];
}

export async function reconcileStaleJobs(
  deps: ReconcilerDependencies,
): Promise<ReconcilerResult> {
  const now = new Date().toISOString();
  const staleCandidates: any[] = [];

  // Query sparse index GSI3 for stale jobs
  const pendingStale = await deps.db.queryGSI3("STATUS#PENDING", now);
  const runningStale = await deps.db.queryGSI3("STATUS#RUNNING", now);

  staleCandidates.push(...pendingStale, ...runningStale);

  const reconciledJobIds: string[] = [];

  for (const candidate of staleCandidates) {
    const job = await deps.db.getItem(`JOB#${candidate.jobId}`, "METADATA");
    if (!job) continue;

    // Must be in PENDING or RUNNING, past due time, and slot not yet released
    if (job.slotReleased === true || (job.status !== "PENDING" && job.status !== "RUNNING")) {
      continue;
    }

    if (job.dueTimeIso && job.dueTimeIso > now) {
      continue;
    }

    let finalStatus = "TIMED_OUT";

    // If Step Functions execution ARN exists, inspect status
    if (deps.stepFunctionsClient && job.stepFunctionExecutionArn) {
      try {
        const exec = await deps.stepFunctionsClient.describeExecution(
          job.stepFunctionExecutionArn,
        );
        if (exec.status === "FAILED") finalStatus = "FAILED";
        else if (exec.status === "TIMED_OUT") finalStatus = "TIMED_OUT";
        else if (exec.status === "ABORTED") finalStatus = "FAILED";
      } catch {
        finalStatus = "FAILED";
      }
    }

    const closedAt = new Date().toISOString();

    try {
      await deps.db.transactWrite([
        {
          type: "Update",
          PK: `JOB#${job.jobId}`,
          SK: "METADATA",
          condition: (item) =>
            Boolean(
              item &&
                item.slotReleased === false &&
                (item.status === "PENDING" || item.status === "RUNNING"),
            ),
          update: (item) => {
            item.status = finalStatus;
            item.slotReleased = true;
            item.closedBy = "RECONCILER";
            item.closedAt = closedAt;
            delete item.GSI3PK;
            delete item.GSI3SK;
          },
        },
        {
          type: "Update",
          PK: `INV#${job.invitationId}`,
          SK: "METADATA",
          condition: (item) => Boolean(item && (item.activeJobsCount ?? 0) > 0),
          update: (item) => {
            item.activeJobsCount = Math.max(0, (item.activeJobsCount ?? 1) - 1);
          },
        },
      ]);

      reconciledJobIds.push(job.jobId);
    } catch {
      // Condition failed or already finalized by concurrent worker: ignore
    }
  }

  return {
    reconciledCount: reconciledJobIds.length,
    reconciledJobIds,
  };
}
