export const COMMITTEE_MAX_MONTHLY_JOBS = 100;
export const COMMITTEE_MAX_MONTHLY_GBS = 120_000;
export const COMMITTEE_RESERVED_GBS_PER_JOB = 1_200;
export const COMMITTEE_MAX_DAILY_JOBS_PER_OWNER = 5;
export const COMMITTEE_QUEUED_TIMEOUT_SECONDS = 120;
export const COMMITTEE_SOFT_DEADLINE_SECONDS = 480;
export const COMMITTEE_HARD_DEADLINE_SECONDS = 600;
export const COMMITTEE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export const META_SK = "META";
export const SLOT_NONE = "NONE";

export function jobPk(jobId: string): string {
  return `JOB#${jobId}`;
}

export function globalQuotaPk(yyyyMM: string): string {
  return `QUOTA#GLOBAL#${yyyyMM}`;
}

export function dayQuotaPk(ownerHash: string, yyyyMMdd: string): string {
  return `QUOTA#OWNER#${ownerHash}#${yyyyMMdd}`;
}

export function globalSlotPk(): string {
  return "SLOT#GLOBAL";
}

export function idempotencyPk(ownerHash: string, keyHash: string): string {
  return `IDEM#${ownerHash}#${keyHash}`;
}

export function formatUtcYearMonth(date: Date): string {
  const yyyy = date.getUTCFullYear().toString();
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${yyyy}${mm}`;
}

export function formatUtcYearMonthDay(date: Date): string {
  const yyyy = date.getUTCFullYear().toString();
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}
