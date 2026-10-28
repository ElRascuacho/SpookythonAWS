import { createHash } from "node:crypto";
import { marshall } from "@aws-sdk/util-dynamodb";
import type {
  TransactWriteItemsCommandInput,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import {
  COMMITTEE_MAX_DAILY_JOBS_PER_OWNER,
  COMMITTEE_MAX_MONTHLY_GBS,
  COMMITTEE_MAX_MONTHLY_JOBS,
  COMMITTEE_RESERVED_GBS_PER_JOB,
  COMMITTEE_TTL_SECONDS,
  dayQuotaPk,
  formatUtcYearMonth,
  formatUtcYearMonthDay,
  globalQuotaPk,
  globalSlotPk,
  idempotencyPk,
  jobPk,
  META_SK,
  SLOT_NONE,
} from "./constants";
import type {
  CommitteeScenarioInput,
  EvaluationJobMetadata,
  JobProgressUpdate,
  TerminalJobTransition,
} from "./types";

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalJsonStringify(item)).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalJsonStringify((obj as Record<string, unknown>)[key])}`,
  );
  return "{" + entries.join(",") + "}";
}

export function hashPayload(payload: unknown): string {
  const canonical = canonicalJsonStringify(payload);
  return createHash("sha256").update(canonical).digest("hex");
}

export function hashIdempotencyKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

export interface BuildAdmissionInputOptions {
  tableName: string;
  ownerHash: string;
  idempotencyKey: string;
  payloadHash: string;
  jobId: string;
  scenario: CommitteeScenarioInput;
  evaluation?: EvaluationJobMetadata;
  now?: Date;
}

export function buildAdmissionTransactionInput(
  options: BuildAdmissionInputOptions,
): TransactWriteItemsCommandInput {
  const {
    tableName,
    ownerHash,
    idempotencyKey,
    payloadHash,
    jobId,
    scenario,
    evaluation,
    now = new Date(),
  } = options;

  const nowEpoch = Math.floor(now.getTime() / 1000);
  const nowIso = now.toISOString();
  const ttlEpoch = nowEpoch + COMMITTEE_TTL_SECONDS;

  const yyyyMM = formatUtcYearMonth(now);
  const yyyyMMdd = formatUtcYearMonthDay(now);
  const keyHash = hashIdempotencyKey(idempotencyKey);

  const softDeadlineIso = new Date(now.getTime() + 480 * 1000).toISOString();
  const hardDeadlineIso = new Date(now.getTime() + 600 * 1000).toISOString();

  // DynamoDB ConditionExpressions do not support arithmetic operators like '+'.
  // We pre-calculate maxPreReservedGbs = maxMonthlyGbs - reservedGbs (120,000 - 1,200 = 118,800).
  const maxPreReservedGbs =
    COMMITTEE_MAX_MONTHLY_GBS - COMMITTEE_RESERVED_GBS_PER_JOB;

  return {
    TransactItems: [
      // 1. Idempotency record (fails if this exact owner + keyHash already exists)
      {
        Put: {
          TableName: tableName,
          Item: marshall(
            {
              pk: idempotencyPk(ownerHash, keyHash),
              sk: META_SK,
              jobId,
              payloadHash,
              createdAt: nowIso,
              ttl: ttlEpoch,
            },
            { removeUndefinedValues: true },
          ),
          ConditionExpression: "attribute_not_exists(pk)",
        },
      },
      // 2. Day quota per owner (max 5 jobs per UTC day)
      {
        Update: {
          TableName: tableName,
          Key: marshall({
            pk: dayQuotaPk(ownerHash, yyyyMMdd),
            sk: META_SK,
          }),
          UpdateExpression:
            "ADD #jobsCount :one SET #ttl = if_not_exists(#ttl, :ttl)",
          ConditionExpression:
            "attribute_not_exists(pk) OR #jobsCount < :maxDailyJobs",
          ExpressionAttributeNames: {
            "#jobsCount": "jobsCount",
            "#ttl": "ttl",
          },
          ExpressionAttributeValues: marshall({
            ":one": 1,
            ":ttl": ttlEpoch,
            ":maxDailyJobs": COMMITTEE_MAX_DAILY_JOBS_PER_OWNER,
          }),
        },
      },
      // 3. Global monthly quota (max 100 jobs and max 120,000 GB-s)
      {
        Update: {
          TableName: tableName,
          Key: marshall({
            pk: globalQuotaPk(yyyyMM),
            sk: META_SK,
          }),
          UpdateExpression:
            "ADD #jobsCount :one, #gbsReserved :reservedGbs SET #ttl = if_not_exists(#ttl, :ttl)",
          ConditionExpression:
            "attribute_not_exists(pk) OR (#jobsCount < :maxMonthlyJobs AND #gbsReserved <= :maxPreReservedGbs)",
          ExpressionAttributeNames: {
            "#jobsCount": "jobsCount",
            "#gbsReserved": "gbsReserved",
            "#ttl": "ttl",
          },
          ExpressionAttributeValues: marshall({
            ":one": 1,
            ":reservedGbs": COMMITTEE_RESERVED_GBS_PER_JOB,
            ":ttl": ttlEpoch,
            ":maxMonthlyJobs": COMMITTEE_MAX_MONTHLY_JOBS,
            ":maxPreReservedGbs": maxPreReservedGbs,
          }),
        },
      },
      // 4. Global Concurrency Slot (only 1 active job allowed)
      {
        Update: {
          TableName: tableName,
          Key: marshall({
            pk: globalSlotPk(),
            sk: META_SK,
          }),
          UpdateExpression:
            "SET #activeJobId = :jobId, #holderOwnerHash = :ownerHash, #leasedAt = :leasedAt, #ttlSoft = :ttlSoft",
          ConditionExpression:
            "attribute_not_exists(#activeJobId) OR #activeJobId = :none",
          ExpressionAttributeNames: {
            "#activeJobId": "activeJobId",
            "#holderOwnerHash": "holderOwnerHash",
            "#leasedAt": "leasedAt",
            "#ttlSoft": "ttlSoft",
          },
          ExpressionAttributeValues: marshall({
            ":jobId": jobId,
            ":ownerHash": ownerHash,
            ":leasedAt": nowIso,
            ":ttlSoft": nowEpoch + 480,
            ":none": SLOT_NONE,
          }),
        },
      },
      // 5. Job Item in queued status
      {
        Put: {
          TableName: tableName,
          Item: marshall(
            {
              pk: jobPk(jobId),
              sk: META_SK,
              jobId,
              ownerHash,
              status: "queued",
              stateRevision: 1,
              cancelRequested: false,
              recommendedPolicyVersion: 0,
              progressPolicyVersion: 0,
              finalAuditStatus: "not-run",
              scenario,
              evaluation,
              evaluationCompletedPairs: evaluation ? 0 : undefined,
              horizonDays: scenario.horizonDays,
              createdAt: nowIso,
              updatedAt: nowIso,
              softDeadlineAt: softDeadlineIso,
              hardDeadlineAt: hardDeadlineIso,
              reservedGbs: COMMITTEE_RESERVED_GBS_PER_JOB,
              manifestKey: `committee/${jobId}/manifest.json`,
              resultPrefix: `committee/${jobId}/`,
              idempotencyKeyHash: keyHash,
              ttl: ttlEpoch,
            },
            { removeUndefinedValues: true },
          ),
          ConditionExpression: "attribute_not_exists(pk)",
        },
      },
    ],
  };
}

export interface BuildClaimJobInputOptions {
  tableName: string;
  jobId: string;
  now?: Date;
}

export function buildClaimJobInput(
  options: BuildClaimJobInputOptions,
): UpdateItemCommandInput {
  const { tableName, jobId, now = new Date() } = options;
  const nowIso = now.toISOString();

  return {
    TableName: tableName,
    Key: marshall({
      pk: jobPk(jobId),
      sk: META_SK,
    }),
    UpdateExpression:
      "SET #status = :running, #stateRevision = #stateRevision + :one, #updatedAt = :now, #startedAt = :now",
    ConditionExpression:
      "attribute_exists(pk) AND #status = :queued AND (attribute_not_exists(#cancelRequested) OR #cancelRequested = :false)",
    ExpressionAttributeNames: {
      "#status": "status",
      "#stateRevision": "stateRevision",
      "#updatedAt": "updatedAt",
      "#startedAt": "startedAt",
      "#cancelRequested": "cancelRequested",
    },
    ExpressionAttributeValues: marshall({
      ":running": "running",
      ":queued": "queued",
      ":one": 1,
      ":now": nowIso,
      ":false": false,
    }),
  };
}

export interface BuildProgressUpdateInputOptions {
  tableName: string;
  jobId: string;
  updates: JobProgressUpdate;
  now?: Date;
}

export function buildProgressUpdateInput(
  options: BuildProgressUpdateInputOptions,
): UpdateItemCommandInput {
  const { tableName, jobId, updates, now = new Date() } = options;
  const nowIso = now.toISOString();

  const setClauses: string[] = [
    "#stateRevision = #stateRevision + :one",
    "#updatedAt = :now",
  ];
  const names: Record<string, string> = {
    "#status": "status",
    "#stateRevision": "stateRevision",
    "#updatedAt": "updatedAt",
  };
  const rawValues: Record<string, unknown> = {
    ":running": "running",
    ":expectedRevision": updates.expectedRevision,
    ":one": 1,
    ":now": nowIso,
  };

  if (updates.completedPairs !== undefined) {
    setClauses.push("#completedPairs = :completedPairs");
    names["#completedPairs"] = "evaluationCompletedPairs";
    names["#cancelRequested"] = "cancelRequested";
    rawValues[":completedPairs"] = updates.completedPairs;
    rawValues[":previousPairs"] = updates.completedPairs - 1;
    rawValues[":false"] = false;
  }
  if (updates.progressPolicyVersion !== undefined) {
    setClauses.push("#progressPolicyVersion = :progressPolicyVersion");
    names["#progressPolicyVersion"] = "progressPolicyVersion";
    rawValues[":progressPolicyVersion"] = updates.progressPolicyVersion;
  }
  if (updates.recommendedPolicyVersion !== undefined) {
    setClauses.push("#recommendedPolicyVersion = :recommendedPolicyVersion");
    names["#recommendedPolicyVersion"] = "recommendedPolicyVersion";
    rawValues[":recommendedPolicyVersion"] = updates.recommendedPolicyVersion;
  }
  if (updates.phase !== undefined) {
    setClauses.push("#phase = :phase");
    names["#phase"] = "phase";
    rawValues[":phase"] = updates.phase;
  }
  if (updates.meanInfections !== undefined) {
    setClauses.push("#meanInfections = :meanInfections");
    names["#meanInfections"] = "meanInfections";
    rawValues[":meanInfections"] = updates.meanInfections;
  }
  if (updates.message !== undefined) {
    setClauses.push("#message = :message");
    names["#message"] = "message";
    rawValues[":message"] = updates.message;
  }

  return {
    TableName: tableName,
    Key: marshall({
      pk: jobPk(jobId),
      sk: META_SK,
    }),
    UpdateExpression: `SET ${setClauses.join(", ")}`,
    ConditionExpression:
      "attribute_exists(pk) AND #status = :running AND #stateRevision = :expectedRevision" +
      (updates.completedPairs !== undefined ? " AND #completedPairs = :previousPairs AND #cancelRequested = :false" : ""),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: marshall(rawValues, {
      removeUndefinedValues: true,
    }),
  };
}

export interface BuildTerminalTransitionOptions {
  tableName: string;
  jobId: string;
  transition: TerminalJobTransition;
  now?: Date;
}

export function buildTerminalTransitionTransactionInput(
  options: BuildTerminalTransitionOptions,
): TransactWriteItemsCommandInput {
  const { tableName, jobId, transition, now = new Date() } = options;
  const nowIso = now.toISOString();

  const setClauses: string[] = [
    "#status = :terminalStatus",
    "#finalAuditStatus = :finalAuditStatus",
    "#stateRevision = #stateRevision + :one",
    "#updatedAt = :now",
    "#finishedAt = :now",
  ];
  const names: Record<string, string> = {
    "#status": "status",
    "#stateRevision": "stateRevision",
    "#finalAuditStatus": "finalAuditStatus",
    "#updatedAt": "updatedAt",
    "#finishedAt": "finishedAt",
  };
  const rawValues: Record<string, unknown> = {
    ":terminalStatus": transition.terminalStatus,
    ":finalAuditStatus": transition.finalAuditStatus,
    ":one": 1,
    ":now": nowIso,
    ":queued": "queued",
    ":running": "running",
  };

  if (transition.expectedRevision !== undefined) rawValues[":expectedRevision"] = transition.expectedRevision;
  if (transition.meanInfections !== undefined) {
    setClauses.push("#meanInfections = :meanInfections");
    names["#meanInfections"] = "meanInfections";
    rawValues[":meanInfections"] = transition.meanInfections;
  }
  if (transition.message !== undefined) {
    setClauses.push("#message = :message");
    names["#message"] = "message";
    rawValues[":message"] = transition.message;
  }

  return {
    TransactItems: [
      // 1. Terminalize Job (only allowed from active statuses 'queued' or 'running')
      {
        Update: {
          TableName: tableName,
          Key: marshall({
            pk: jobPk(jobId),
            sk: META_SK,
          }),
          UpdateExpression: `SET ${setClauses.join(", ")}`,
          ConditionExpression:
            "attribute_exists(pk) AND #status IN (:queued, :running)" +
            (transition.expectedRevision !== undefined ? " AND #stateRevision = :expectedRevision" : ""),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: marshall(rawValues, {
            removeUndefinedValues: true,
          }),
        },
      },
      // 2. Release Global Slot if currently assigned to this jobId
      {
        Update: {
          TableName: tableName,
          Key: marshall({
            pk: globalSlotPk(),
            sk: META_SK,
          }),
          UpdateExpression:
            "SET #activeJobId = :none REMOVE #holderOwnerHash, #leasedAt, #ttlSoft",
          ConditionExpression:
            "attribute_not_exists(#activeJobId) OR #activeJobId = :none OR #activeJobId = :jobId",
          ExpressionAttributeNames: {
            "#activeJobId": "activeJobId",
            "#holderOwnerHash": "holderOwnerHash",
            "#leasedAt": "leasedAt",
            "#ttlSoft": "ttlSoft",
          },
          ExpressionAttributeValues: marshall({
            ":none": SLOT_NONE,
            ":jobId": jobId,
          }),
        },
      },
    ],
  };
}

export function buildCancelRequestInput(
  tableName: string,
  jobId: string,
  now = new Date(),
): UpdateItemCommandInput {
  return {
    TableName: tableName,
    Key: marshall({
      pk: jobPk(jobId),
      sk: META_SK,
    }),
    UpdateExpression:
      "SET #cancelRequested = :true, #updatedAt = :now, #stateRevision = #stateRevision + :one",
    ConditionExpression:
      "attribute_exists(pk) AND #status IN (:queued, :running)",
    ExpressionAttributeNames: {
      "#cancelRequested": "cancelRequested",
      "#updatedAt": "updatedAt",
      "#stateRevision": "stateRevision",
      "#status": "status",
    },
    ExpressionAttributeValues: marshall({
      ":true": true,
      ":now": now.toISOString(),
      ":one": 1,
      ":queued": "queued",
      ":running": "running",
    }),
  };
}

export function buildSlotDirectReleaseInput(
  tableName: string,
  expectedJobId?: string,
): UpdateItemCommandInput {
  const names: Record<string, string> = {
    "#activeJobId": "activeJobId",
    "#holderOwnerHash": "holderOwnerHash",
    "#leasedAt": "leasedAt",
    "#ttlSoft": "ttlSoft",
  };
  const rawValues: Record<string, unknown> = {
    ":none": SLOT_NONE,
  };

  let condition = "attribute_exists(pk)";
  if (expectedJobId) {
    condition =
      "attribute_not_exists(#activeJobId) OR #activeJobId = :none OR #activeJobId = :expectedJobId";
    rawValues[":expectedJobId"] = expectedJobId;
  }

  return {
    TableName: tableName,
    Key: marshall({
      pk: globalSlotPk(),
      sk: META_SK,
    }),
    UpdateExpression:
      "SET #activeJobId = :none REMOVE #holderOwnerHash, #leasedAt, #ttlSoft",
    ConditionExpression: condition,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: marshall(rawValues),
  };
}
