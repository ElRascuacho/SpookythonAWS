import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetItemCommand, TransactWriteItemsCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  COMMITTEE_QUEUED_TIMEOUT_SECONDS,
  globalSlotPk,
  jobPk,
  META_SK,
  SLOT_NONE,
} from "./constants";
import {
  buildSlotDirectReleaseInput,
  buildTerminalTransitionTransactionInput,
} from "./conditions";
import type { JobDdbItem, JobStatus } from "./types";
import { TERMINAL_JOB_STATUSES } from "./types";

export interface ReconcileResult {
  reconciled: boolean;
  reason:
    | "slot_free"
    | "orphan_slot_released"
    | "terminal_job_slot_released"
    | "expired_queued_job"
    | "overdue_running_job"
    | "active_job_valid"
    | "concurrency_race";
  jobId?: string;
}

export class CommitteeReconciler {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string,
  ) {}

  async reconcileSlot(now = new Date()): Promise<ReconcileResult> {
    const slotItem = await this.getGlobalSlot();
    const activeJobId = slotItem?.activeJobId;

    if (!activeJobId || activeJobId === SLOT_NONE) {
      return { reconciled: false, reason: "slot_free" };
    }

    const job = await this.getJob(activeJobId);
    if (!job) {
      // Case A: Slot points to non-existent job -> release slot
      await this.releaseSlot(activeJobId);
      return {
        reconciled: true,
        reason: "orphan_slot_released",
        jobId: activeJobId,
      };
    }

    // Case B: Job already in terminal status -> release slot
    if (TERMINAL_JOB_STATUSES.has(job.status as JobStatus)) {
      await this.releaseSlot(activeJobId);
      return {
        reconciled: true,
        reason: "terminal_job_slot_released",
        jobId: activeJobId,
      };
    }

    const nowEpoch = Math.floor(now.getTime() / 1000);
    const createdEpoch = Math.floor(new Date(job.createdAt).getTime() / 1000);

    // Case C: Job queued and expired (exceeded 120s queued limit)
    if (
      job.status === "queued" &&
      nowEpoch - createdEpoch > COMMITTEE_QUEUED_TIMEOUT_SECONDS
    ) {
      try {
        const txInput = buildTerminalTransitionTransactionInput({
          tableName: this.tableName,
          jobId: activeJobId,
          transition: {
            terminalStatus: "timed-out",
            finalAuditStatus: "not-run",
            message: "Queued job expired before worker claim",
          },
          now,
        });
        await this.client.send(new TransactWriteItemsCommand(txInput));
        return {
          reconciled: true,
          reason: "expired_queued_job",
          jobId: activeJobId,
        };
      } catch (err: unknown) {
        // Concurrency race: worker may have claimed or finished in the meantime
        return {
          reconciled: false,
          reason: "concurrency_race",
          jobId: activeJobId,
        };
      }
    }

    // Case D: Job running and overdue (exceeded hardDeadlineAt)
    const hardDeadlineEpoch = Math.floor(
      new Date(job.hardDeadlineAt).getTime() / 1000,
    );
    if (job.status === "running" && nowEpoch >= hardDeadlineEpoch) {
      try {
        const txInput = buildTerminalTransitionTransactionInput({
          tableName: this.tableName,
          jobId: activeJobId,
          transition: {
            terminalStatus: "timed-out",
            finalAuditStatus: "not-run",
            message: "Job exceeded hard deadline",
          },
          now,
        });
        await this.client.send(new TransactWriteItemsCommand(txInput));
        return {
          reconciled: true,
          reason: "overdue_running_job",
          jobId: activeJobId,
        };
      } catch (err: unknown) {
        return {
          reconciled: false,
          reason: "concurrency_race",
          jobId: activeJobId,
        };
      }
    }

    return {
      reconciled: false,
      reason: "active_job_valid",
      jobId: activeJobId,
    };
  }

  private async getGlobalSlot(): Promise<{
    activeJobId?: string;
    holderOwnerHash?: string;
    leasedAt?: string;
  } | null> {
    const res = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          pk: globalSlotPk(),
          sk: META_SK,
        }),
      }),
    );
    if (!res.Item) return null;
    return unmarshall(res.Item) as {
      activeJobId?: string;
      holderOwnerHash?: string;
      leasedAt?: string;
    };
  }

  private async getJob(jobId: string): Promise<JobDdbItem | null> {
    const res = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          pk: jobPk(jobId),
          sk: META_SK,
        }),
      }),
    );
    if (!res.Item) return null;
    return unmarshall(res.Item) as JobDdbItem;
  }

  private async releaseSlot(expectedJobId: string): Promise<void> {
    const cmd = buildSlotDirectReleaseInput(this.tableName, expectedJobId);
    try {
      await this.client.send(new UpdateItemCommand(cmd));
    } catch {
      // Ignore if slot was already released or acquired by another job
    }
  }
}
