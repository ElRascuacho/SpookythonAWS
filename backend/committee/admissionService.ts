import { randomUUID } from "node:crypto";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  GetItemCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  buildAdmissionTransactionInput,
  buildCancelRequestInput,
  buildClaimJobInput,
  buildProgressUpdateInput,
  buildTerminalTransitionTransactionInput,
  hashIdempotencyKey,
  hashPayload,
} from "./conditions";
import {
  idempotencyPk,
  jobPk,
  META_SK,
} from "./constants";
import { CommitteeReconciler } from "./reconciler";
import type {
  AdmitJobRequest,
  AdmitJobResult,
  IdempotencyDdbItem,
  JobDdbItem,
  JobProgressUpdate,
  TerminalJobTransition,
} from "./types";
import {
  IdempotencyConflictError,
  InvalidStateTransitionError,
  JobNotFoundError,
  QuotaExhaustedError,
  SlotBusyError,
  TERMINAL_JOB_STATUSES,
} from "./types";

export class CommitteeAdmissionService {
  private readonly reconciler: CommitteeReconciler;

  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string,
    reconciler?: CommitteeReconciler,
  ) {
    this.reconciler =
      reconciler ?? new CommitteeReconciler(this.client, this.tableName);
  }

  async reconcileSlot(now = new Date()) {
    return this.reconciler.reconcileSlot(now);
  }

  async admitJob(request: AdmitJobRequest): Promise<AdmitJobResult> {
    const {
      ownerHash,
      idempotencyKey,
      scenario,
      evaluation,
      now = new Date(),
    } = request;

    const payloadHash = hashPayload(evaluation ? { scenario, evaluation } : scenario);
    const keyHash = hashIdempotencyKey(idempotencyKey);

    // 1. Idempotency pre-check
    const existingIdemp = await this.getIdempotencyRecord(ownerHash, keyHash);
    if (existingIdemp) {
      if (existingIdemp.payloadHash === payloadHash) {
        const existingJob = await this.getJob(existingIdemp.jobId);
        return {
          jobId: existingIdemp.jobId,
          status: existingJob?.status ?? "queued",
          stateRevision: existingJob?.stateRevision ?? 1,
          idempotent: true,
        };
      }
      throw new IdempotencyConflictError(
        "Conflicto de idempotencia: el payload difiere para la misma clave.",
      );
    }

    // 2. Prepare transaction
    const jobId = randomUUID();
    const executeAdmissionTx = async (): Promise<void> => {
      const txInput = buildAdmissionTransactionInput({
        tableName: this.tableName,
        ownerHash,
        idempotencyKey,
        payloadHash,
        jobId,
        scenario,
        evaluation,
        now,
      });
      await this.client.send(new TransactWriteItemsCommand(txInput));
    };

    try {
      await executeAdmissionTx();
      return {
        jobId,
        status: "queued",
        stateRevision: 1,
        idempotent: false,
      };
    } catch (err: unknown) {
      return await this.handleAdmissionError(
        err,
        ownerHash,
        keyHash,
        payloadHash,
        jobId,
        executeAdmissionTx,
      );
    }
  }

  private async handleAdmissionError(
    err: unknown,
    ownerHash: string,
    keyHash: string,
    payloadHash: string,
    jobId: string,
    retryFn: () => Promise<void>,
  ): Promise<AdmitJobResult> {
    const errorObj = err as {
      name?: string;
      CancellationReasons?: Array<{ Code?: string; Message?: string }>;
    };

    if (errorObj.name === "TransactionCanceledException") {
      const reasons = errorObj.CancellationReasons ?? [];

      // Reason 0: Idempotency Put condition check failed
      if (reasons[0]?.Code === "ConditionalCheckFailed") {
        const raceRecord = await this.getIdempotencyRecord(ownerHash, keyHash);
        if (raceRecord) {
          if (raceRecord.payloadHash === payloadHash) {
            const raceJob = await this.getJob(raceRecord.jobId);
            return {
              jobId: raceRecord.jobId,
              status: raceJob?.status ?? "queued",
              stateRevision: raceJob?.stateRevision ?? 1,
              idempotent: true,
            };
          }
          throw new IdempotencyConflictError(
            "Conflicto de idempotencia en concurrencia: el payload difiere para la misma clave.",
          );
        }
      }

      // Reason 1: Day quota exceeded (max 5 per day)
      if (reasons[1]?.Code === "ConditionalCheckFailed") {
        throw new QuotaExhaustedError(
          "Cuota diaria alcanzada para esta sesión (máximo 5 jobs/día).",
        );
      }

      // Reason 2: Global month quota exceeded (max 100 jobs or 120,000 GB-s)
      if (reasons[2]?.Code === "ConditionalCheckFailed") {
        throw new QuotaExhaustedError(
          "Cuota global mensual de cómputo alcanzada (máximo 100 jobs o 120,000 GB-s).",
        );
      }

      // Reason 3: Global Concurrency Slot busy
      if (reasons[3]?.Code === "ConditionalCheckFailed") {
        // Attempt bounded reconciliation in case slot holder is overdue or expired
        const reconcileRes = await this.reconciler.reconcileSlot();
        if (reconcileRes.reconciled) {
          // Retry admission once now that slot was freed
          try {
            await retryFn();
            return {
              jobId,
              status: "queued",
              stateRevision: 1,
              idempotent: false,
            };
          } catch (retryErr: unknown) {
            const retryObj = retryErr as {
              name?: string;
              CancellationReasons?: Array<{ Code?: string }>;
            };
            if (
              retryObj.name === "TransactionCanceledException" &&
              retryObj.CancellationReasons?.[3]?.Code === "ConditionalCheckFailed"
            ) {
              throw new SlotBusyError(
                "Slot activo ocupado: ya existe otra búsqueda del comité en ejecución.",
              );
            }
            throw retryErr;
          }
        }
        throw new SlotBusyError(
          "Slot activo ocupado: ya existe otra búsqueda del comité en ejecución.",
        );
      }
    }

    throw err;
  }

  async claimQueuedJob(
    jobId: string,
    now = new Date(),
  ): Promise<{ success: boolean; stateRevision: number }> {
    const cmd = buildClaimJobInput({
      tableName: this.tableName,
      jobId,
      now,
    });

    try {
      await this.client.send(new UpdateItemCommand(cmd));
      return { success: true, stateRevision: 2 };
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e.name === "ConditionalCheckFailedException") {
        throw new InvalidStateTransitionError(
          `No se pudo reclamar el job ${jobId}: no está en estado 'queued' o fue cancelado.`,
        );
      }
      throw err;
    }
  }

  async updateProgress(
    jobId: string,
    updates: JobProgressUpdate,
    now = new Date(),
  ): Promise<{ stateRevision: number }> {
    const cmd = buildProgressUpdateInput({
      tableName: this.tableName,
      jobId,
      updates,
      now,
    });

    try {
      await this.client.send(new UpdateItemCommand(cmd));
      return { stateRevision: updates.expectedRevision + 1 };
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e.name === "ConditionalCheckFailedException") {
        throw new InvalidStateTransitionError(
          `CAS de progreso rechazado para job ${jobId}: el estado no es 'running' o la revisión esperada no coincide.`,
        );
      }
      throw err;
    }
  }

  async terminalizeJob(
    jobId: string,
    transition: TerminalJobTransition,
    now = new Date(),
  ): Promise<void> {
    const tx = buildTerminalTransitionTransactionInput({
      tableName: this.tableName,
      jobId,
      transition,
      now,
    });

    try {
      await this.client.send(new TransactWriteItemsCommand(tx));
    } catch (err: unknown) {
      const e = err as {
        name?: string;
        CancellationReasons?: Array<{ Code?: string }>;
      };
      if (
        e.name === "TransactionCanceledException" ||
        e.name === "ConditionalCheckFailedException"
      ) {
        throw new InvalidStateTransitionError(
          `Transición terminal rechazada para job ${jobId}: el job ya no se encuentra en estado activo ('queued' o 'running').`,
        );
      }
      throw err;
    }
  }

  async requestCancel(
    jobId: string,
    callerOwnerHash: string,
    now = new Date(),
  ): Promise<JobDdbItem> {
    const job = await this.getJob(jobId, callerOwnerHash);
    if (!job) {
      throw new JobNotFoundError("Job no encontrado.");
    }

    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      return job;
    }

    const cmd = buildCancelRequestInput(this.tableName, jobId, now);
    try {
      await this.client.send(new UpdateItemCommand(cmd));
      return {
        ...job,
        cancelRequested: true,
        stateRevision: job.stateRevision + 1,
        updatedAt: now.toISOString(),
      };
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e.name === "ConditionalCheckFailedException") {
        // Job became terminal concurrently
        const fresh = await this.getJob(jobId, callerOwnerHash);
        return fresh ?? job;
      }
      throw err;
    }
  }

  async getJob(
    jobId: string,
    callerOwnerHash?: string,
  ): Promise<JobDdbItem | null> {
    const res = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        ConsistentRead: true,
        Key: marshall({
          pk: jobPk(jobId),
          sk: META_SK,
        }),
      }),
    );

    if (!res.Item) return null;
    const job = unmarshall(res.Item) as JobDdbItem;

    if (callerOwnerHash !== undefined && job.ownerHash !== callerOwnerHash) {
      // AC-04: deny without revealing existence
      throw new JobNotFoundError("Job no encontrado.");
    }

    return job;
  }

  private async getIdempotencyRecord(
    ownerHash: string,
    keyHash: string,
  ): Promise<IdempotencyDdbItem | null> {
    const res = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        ConsistentRead: true,
        Key: marshall({
          pk: idempotencyPk(ownerHash, keyHash),
          sk: META_SK,
        }),
      }),
    );
    if (!res.Item) return null;
    return unmarshall(res.Item) as IdempotencyDdbItem;
  }
}
