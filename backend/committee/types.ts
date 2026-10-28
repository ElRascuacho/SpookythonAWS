export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "no-improvement"
  | "cancelled"
  | "timed-out"
  | "failed";

export const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  "completed",
  "no-improvement",
  "cancelled",
  "timed-out",
  "failed",
]);

export type JobPhase =
  | "queued"
  | "baseline"
  | "training"
  | "selection"
  | "promotion"
  | "final_audit"
  | "terminal";

export type FinalAuditStatus = "not-run" | "passed" | "failed";

export interface CommitteeScenarioInput {
  scenarioKey: string;
  horizonDays: number;
  seed: number;
  originNodeId?: string;
  dailyBudgetUsd?: number;
  vaccineLotSize?: number;
  betaHuman?: number;
  betaVector?: number;
  [key: string]: unknown;
}

export interface JobDdbItem {
  pk: string;
  sk: string;
  jobId: string;
  ownerHash: string;
  status: JobStatus;
  stateRevision: number;
  cancelRequested: boolean;
  recommendedPolicyVersion: number;
  progressPolicyVersion: number;
  finalAuditStatus: FinalAuditStatus;
  scenario: CommitteeScenarioInput;
  horizonDays: number;
  createdAt: string;
  updatedAt: string;
  softDeadlineAt: string;
  hardDeadlineAt: string;
  reservedGbs: number;
  manifestKey: string;
  resultPrefix: string;
  idempotencyKeyHash?: string;
  ttl: number;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  meanInfections?: number | null;
  phase?: JobPhase;
  evaluation?: EvaluationJobMetadata;
  evaluationCompletedPairs?: number;
}

export interface GlobalQuotaDdbItem {
  pk: string;
  sk: string;
  jobsCount: number;
  gbsReserved: number;
  ttl: number;
}

export interface DayQuotaDdbItem {
  pk: string;
  sk: string;
  jobsCount: number;
  ttl: number;
}

export interface GlobalSlotDdbItem {
  pk: string;
  sk: string;
  activeJobId?: string;
  holderOwnerHash?: string;
  leasedAt?: string;
  ttlSoft?: number;
}

export interface IdempotencyDdbItem {
  pk: string;
  sk: string;
  jobId: string;
  payloadHash: string;
  createdAt: string;
  ttl: number;
}

export interface EvaluationJobMetadata {
  registryVersion: string;
  artifactHash: string;
  plannedPairs: number;
}

export interface AdmitJobRequest {
  ownerHash: string;
  idempotencyKey: string;
  scenario: CommitteeScenarioInput;
  evaluation?: EvaluationJobMetadata;
  now?: Date;
}

export interface AdmitJobResult {
  jobId: string;
  status: JobStatus;
  stateRevision: number;
  idempotent: boolean;
}

export interface JobProgressUpdate {
  expectedRevision: number;
  completedPairs?: number;
  progressPolicyVersion?: number;
  recommendedPolicyVersion?: number;
  phase?: JobPhase;
  meanInfections?: number | null;
  message?: string | null;
}

export interface TerminalJobTransition {
  terminalStatus: Extract<
    JobStatus,
    "completed" | "no-improvement" | "cancelled" | "timed-out" | "failed"
  >;
  finalAuditStatus: FinalAuditStatus;
  expectedRevision?: number;
  meanInfections?: number | null;
  message?: string | null;
}

export class CommitteeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class QuotaExhaustedError extends CommitteeError {
  constructor(message = "Quota exhausted") {
    super("committee.quota_exhausted", message, 429);
  }
}

export class SlotBusyError extends CommitteeError {
  constructor(message = "Another committee job is active") {
    super("committee.slot_busy", message, 409);
  }
}

export class IdempotencyConflictError extends CommitteeError {
  constructor(message = "Payload mismatch for existing idempotency key") {
    super("committee.invalid_request", message, 409);
  }
}

export class JobNotFoundError extends CommitteeError {
  constructor(message = "Job not found") {
    super("committee.not_found", message, 404);
  }
}

export class InvalidStateTransitionError extends CommitteeError {
  constructor(message = "Invalid job state transition or stale revision") {
    super("committee.conflict", message, 409);
  }
}
