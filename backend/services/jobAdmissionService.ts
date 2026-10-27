import { randomUUID } from "node:crypto";
import { InMemoryDatabase, TransactWriteAction } from "../storage/inMemoryDatabase";
import { hashSecret } from "../auth/crypto";
import { JobVisibility } from "../../src/domain/schemas/api.schema";
import { ValidatedPartialSimulationParams } from "../../src/domain/schemas/simulationParams.schema";

export interface AdmitJobInput {
  invitationId: string;
  params?: ValidatedPartialSimulationParams;
  enableAiStrategy?: boolean;
  visibility?: JobVisibility;
  idempotencyKey?: string;
}

export interface AdmitJobResult {
  jobId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "TIMED_OUT";
  idempotent: boolean;
  estimatedTimeSeconds?: number;
}

export class JobAdmissionService {
  constructor(private db: InMemoryDatabase) {}

  async admitJob(input: AdmitJobInput): Promise<AdmitJobResult> {
    const {
      invitationId,
      params = {},
      enableAiStrategy = false,
      visibility = "PRIVATE",
      idempotencyKey,
    } = input;

    // 1. Stable JSON payload hashing
    const canonicalPayloadString = JSON.stringify({
      params,
      enableAiStrategy,
      visibility,
    });
    const payloadHash = hashSecret(canonicalPayloadString);

    // 2. Idempotency check if header provided
    let idempKeyHash: string | null = null;
    if (idempotencyKey && idempotencyKey.trim().length > 0) {
      idempKeyHash = hashSecret(idempotencyKey.trim());
      const existingIdemp = await this.db.getItem(
        `IDEMP#${invitationId}#${idempKeyHash}`,
        "RECORD",
      );

      if (existingIdemp) {
        if (existingIdemp.payloadHash === payloadHash) {
          // Idempotent hit: return existing job without burning quota or slot
          return {
            jobId: existingIdemp.jobId,
            status: existingIdemp.status || "PENDING",
            idempotent: true,
          };
        } else {
          // Conflicting payload with the same key
          throw new Error(
            "Conflicto de idempotencia: el payload difiere para la misma clave (payload mismatch).",
          );
        }
      }
    }

    // 3. Pre-flight verification of quotas and active concurrency slot
    const today = new Date().toISOString().slice(0, 10);
    const globalQuotaKey = `GLOBAL_QUOTA#${today}`;
    const globalQuotaItem = await this.db.getItem(globalQuotaKey, "COUNTER");
    if (globalQuotaItem && globalQuotaItem.jobCount >= 100) {
      throw new Error(
        "Cuota global diaria de simulaciones alcanzada (límite de 100 jobs/día en la plataforma).",
      );
    }

    const invQuotaKey = `QUOTA#${invitationId}#${today}`;
    const invQuotaItem = await this.db.getItem(invQuotaKey, "COUNTER");
    const invItem = await this.db.getItem(`INV#${invitationId}`, "METADATA");
    if (!invItem) {
      throw new Error("Invitación no encontrada.");
    }
    const maxPerDay = invItem.maxJobsPerDay ?? 20;
    if (invQuotaItem && invQuotaItem.jobCount >= maxPerDay) {
      throw new Error(
        `Cuota diaria alcanzada para esta invitación (${maxPerDay} jobs/día).`,
      );
    }

    if (invItem.activeJobsCount && invItem.activeJobsCount >= 1) {
      throw new Error(
        "Slot activo ocupado: ya tiene una simulación en ejecución (active job already running).",
      );
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const dueTimeIso = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15 min limit
    const jobId = randomUUID();
    const ttl = Math.floor(now.getTime() / 1000) + 7 * 24 * 60 * 60; // 7 days

    const strategies = enableAiStrategy
      ? ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS", "AI_CORTAFUEGOS"]
      : ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"];
    const totalRuns = enableAiStrategy ? 2000 : 1500;

    // 4. Construct atomic 5-operation transaction
    const actions: TransactWriteAction[] = [
      // Op 1: Global quota increment
      {
        type: "Update",
        PK: globalQuotaKey,
        SK: "COUNTER",
        condition: (item) => !item || (item.jobCount ?? 0) < 100,
        update: (item) => {
          item.jobCount = (item.jobCount ?? 0) + 1;
          item.date = today;
          item.ttl = ttl;
        },
      },
      // Op 2: Per-invitation quota increment
      {
        type: "Update",
        PK: invQuotaKey,
        SK: "COUNTER",
        condition: (item) => !item || (item.jobCount ?? 0) < maxPerDay,
        update: (item) => {
          item.jobCount = (item.jobCount ?? 0) + 1;
          item.invitationId = invitationId;
          item.date = today;
          item.ttl = ttl;
        },
      },
      // Op 3: Concurrency slot reservation on Invitation
      {
        type: "Update",
        PK: `INV#${invitationId}`,
        SK: "METADATA",
        condition: (item) =>
          Boolean(
            item &&
              item.status === "ACTIVE" &&
              item.expiresAt > createdAt &&
              (item.activeJobsCount ?? 0) < 1,
          ),
        update: (item) => {
          item.activeJobsCount = (item.activeJobsCount ?? 0) + 1;
        },
      },
      // Op 4: Job record initialization
      {
        type: "Put",
        item: {
          PK: `JOB#${jobId}`,
          SK: "METADATA",
          jobId,
          invitationId,
          invitationKey: `INV#${invitationId}`,
          status: "PENDING",
          slotReleased: false,
          attempt: 1,
          visibility,
          canonicalInput: canonicalPayloadString,
          scenarioParams: params,
          strategies,
          runsPerStrategy: 500,
          totalRuns,
          createdAt,
          dueTimeIso,
          GSI1PK: `INV#${invitationId}`,
          GSI1SK: `STATUS#PENDING#CREATED#${createdAt}`,
          GSI2PK: `VISIBILITY#${visibility}`,
          GSI2SK: `CREATED#${createdAt}`,
          GSI3PK: "STATUS#PENDING",
          GSI3SK: dueTimeIso,
          ttl,
        },
      },
    ];

    // Op 5: Idempotency record if key provided
    if (idempKeyHash) {
      actions.push({
        type: "Put",
        item: {
          PK: `IDEMP#${invitationId}#${idempKeyHash}`,
          SK: "RECORD",
          jobId,
          payloadHash,
          status: "PENDING",
          createdAt,
          ttl,
        },
      });
    }

    await this.db.transactWrite(actions);

    return {
      jobId,
      status: "PENDING",
      idempotent: false,
      estimatedTimeSeconds: 45,
    };
  }
}
