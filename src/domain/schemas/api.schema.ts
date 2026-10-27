import { z } from "zod";
import { PartialSimulationParamsSchema } from "./simulationParams.schema";

export const InvitationCodeRegex =
  /^(MC-[0-9A-Fa-f]{5}-[0-9A-Fa-f]{5}-[0-9A-Fa-f]{5}-[0-9A-Fa-f]{5}|SPK-[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3,7}|[a-f0-9]{32,64})$/;

export const CreateSessionRequestSchema = z
  .object({
    code: z
      .string()
      .min(16, "El código debe tener al menos 16 caracteres")
      .max(128, "El código no debe exceder 128 caracteres")
      .regex(InvitationCodeRegex, "Formato de código de invitación no válido"),
  })
  .strict();

export const JobVisibilitySchema = z.enum(["PRIVATE", "SHARED_INVITEES"]);
export type JobVisibility = z.infer<typeof JobVisibilitySchema>;

export const JobStatusEnumSchema = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "TIMED_OUT",
]);
export type JobStatusEnum = z.infer<typeof JobStatusEnumSchema>;

export const CreateJobRequestSchema = z
  .object({
    params: PartialSimulationParamsSchema.optional().default({}),
    enableAiStrategy: z.boolean().optional().default(false),
    visibility: JobVisibilitySchema.optional().default("PRIVATE"),
    idempotencyKey: z.string().min(1).max(128).optional(),
  })
  .strict();

export const JobSummaryItemSchema = z.object({
  jobId: z.string(),
  status: JobStatusEnumSchema,
  createdAt: z.string(),
  totalRuns: z.number(),
  strategies: z.array(z.string()),
  visibility: JobVisibilitySchema,
  attempt: z.number().int().default(1),
  completedAt: z.string().optional(),
  dueTimeIso: z.string().optional(),
});

export const JobStatusResponseSchema = z.object({
  ok: z.literal(true),
  job: JobSummaryItemSchema,
});

export const JobListResponseSchema = z.object({
  ok: z.literal(true),
  jobs: z.array(JobSummaryItemSchema),
});

export const JobResultsResponseSchema = z.object({
  ok: z.literal(true),
  jobId: z.string(),
  status: JobStatusEnumSchema,
  result: z.record(z.string(), z.any()),
  aiSummary: z.string().optional(),
});

export const ApiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
  details: z.any().optional(),
});

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;
export type JobSummaryItem = z.infer<typeof JobSummaryItemSchema>;
export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;
export type JobListResponse = z.infer<typeof JobListResponseSchema>;
export type JobResultsResponse = z.infer<typeof JobResultsResponseSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
