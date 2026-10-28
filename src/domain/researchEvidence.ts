import { z } from "zod";
import {
  WorkspaceSchema,
  MeasureSchema,
  resolveResearchEffects,
  type ResearchWorkspace,
} from "./research";
import { SimulationParamsSchema } from "./schemas/simulationParams.schema";
import { runSingleSeirSimulation } from "./seirEngine";
import { createSeededRng } from "./prng";
const metric = z
  .object({
    infected: z.number().nonnegative(),
    peak: z.number().nonnegative(),
    collapseDays: z.number().nonnegative(),
    cost: z.number().nonnegative(),
  })
  .strict();
export const EvidenceSchema = z
  .object({
    protocol: z.literal("research-paired-v1"),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.string().datetime(),
    configuration: WorkspaceSchema,
    replicas: z.union([z.literal(16), z.literal(32)]),
    baseline: metric,
    candidate: metric,
    infectionDifference: z.number(),
    interval: z.tuple([z.number(), z.number()]),
  })
  .strict();
export type ResearchEvidence = z.infer<typeof EvidenceSchema>;
export const CommitteeSummarySchema = z
  .object({
    jobId: z.string().min(1).max(100),
    status: z.enum(["queued", "running", "completed", "cancelled", "failed"]),
    stateRevision: z.number().int().nonnegative(),
    recommendedPolicyVersion: z.number().int().nonnegative(),
    finalAudit: z.enum(["not-run", "passed", "failed"]),
    baselineMean: z.number().finite().nonnegative().nullable(),
    candidateMean: z.number().finite().nonnegative().nullable(),
    note: z.string().max(1500),
  })
  .strict();
export type CommitteeSummary = z.infer<typeof CommitteeSummarySchema>;
export const ResearchContextSchema = z
  .object({
    schemaVersion: z.literal(1),
    selectedMeasure: MeasureSchema.nullable(),
    editableParameters: SimulationParamsSchema,
    executionParameters: SimulationParamsSchema.nullable(),
    configurationChanged: z.boolean(),
    observed: z
      .object({
        day: z.number().int().min(0).max(60),
        infected: z.number().nonnegative(),
        exposed: z.number().nonnegative(),
        recovered: z.number().nonnegative(),
        cumulativeInfected: z.number().nonnegative(),
        hospitalCollapsed: z.boolean(),
      })
      .strict(),
    measures: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            name: z.string().max(100),
            revision: z.number().int().positive(),
            confirmed: z.boolean(),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .max(8),
    evidence: EvidenceSchema.omit({ configuration: true }).nullable(),
    evidenceCurrent: z.boolean(),
    committee: CommitteeSummarySchema.nullable(),
    committeeReadAt: z.string().datetime().nullable(),
  })
  .strict();
export type ResearchContext = z.infer<typeof ResearchContextSchema>;
export function evidenceSummary(e: ResearchEvidence | null) {
  if (!e) return null;
  const { configuration: _configuration, ...summary } = e;
  return summary;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, "en"))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export const INVALID_WORKSPACE_MESSAGE =
  "La configuración del experimento no es válida: revisa el horizonte, al menos un origen del brote y los valores numéricos.";
/**
 * Returns a canonical identity for a valid workspace, or null when the
 * editable configuration is incomplete/invalid. Callers render with null
 * instead of throwing during React render.
 */
export function configurationIdentity(
  workspace: ResearchWorkspace,
): string | null {
  const parsed = WorkspaceSchema.safeParse(workspace);
  if (!parsed.success) return null;
  const w = parsed.data;
  return canonical({
    protocol: "research-paired-v1",
    engine: w.engineVersion,
    graph: "manta-v1",
    budget: "research-before-policy-v1",
    params: w.params,
    strategy: w.strategy,
    measures: w.drafts
      .map((d) => ({
        id: d.id,
        revision: d.revision,
        enabled: d.enabled,
        definition: d.definition,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}
export async function configurationHash(
  w: ResearchWorkspace,
): Promise<string | null> {
  const identity = configurationIdentity(w);
  if (identity === null) return null;
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity),
  );
  return Array.from(new Uint8Array(bytes), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export function confirmedMeasures(workspace: ResearchWorkspace) {
  const parsed = WorkspaceSchema.safeParse(workspace);
  if (!parsed.success) throw Error(INVALID_WORKSPACE_MESSAGE);
  const w = parsed.data;
  const active = w.drafts.filter((d) => d.enabled);
  if (!active.length) throw Error("Activa al menos una medida para comparar.");
  if (
    active.some(
      (d) =>
        d.confirmedRevision !== d.revision ||
        !d.confirmed ||
        canonical(d.confirmed) !== canonical(d.definition),
    )
  )
    throw Error("Confirma todas las revisiones activas antes de evaluar.");
  return active.map((d) => ({ id: d.id, definition: d.confirmed! }));
}
/** A paired evaluation, NOT a second CEM search or a final Committee audit. Runs in a worker. */
export function compareResearch(
  workspace: ResearchWorkspace,
  replicas: 16 | 32,
  onProgress: (done: number) => void = () => {},
) {
  const parsed = WorkspaceSchema.safeParse(workspace);
  if (!parsed.success) throw Error(INVALID_WORKSPACE_MESSAGE);
  const w = parsed.data,
    measures = confirmedMeasures(w);
  if (replicas !== 16 && replicas !== 32)
    throw Error("Solo se permiten 16 o 32 réplicas.");
  const baseline = { infected: 0, peak: 0, collapseDays: 0, cost: 0 },
    candidate = { ...baseline };
  const differences: number[] = [];
  for (let i = 0; i < replicas; i++) {
    const options = { envNamespace: "research-paired-v1" };
    const a = runSingleSeirSimulation(
      w.params,
      w.strategy,
      i,
      undefined,
      undefined,
      undefined,
      options,
    );
    const b = runSingleSeirSimulation(
      w.params,
      w.strategy,
      i,
      undefined,
      undefined,
      {
        resolveDailyEffects: (day, state, budget) =>
          resolveResearchEffects(day, state, budget, measures),
      },
      options,
    );
    for (const [target, run] of [
      [baseline, a],
      [candidate, b],
    ] as const) {
      target.infected += run.totalCumulativeInfected / replicas;
      target.peak += run.peakZombies / replicas;
      target.collapseDays += run.hospitalCollapseDays / replicas;
      target.cost += run.totalBudgetSpent / replicas;
    }
    differences.push(b.totalCumulativeInfected - a.totalCumulativeInfected);
    onProgress(i + 1);
  }
  const rng = createSeededRng(w.params.seed, "research-bootstrap-v1", 0),
    samples: number[] = [];
  for (let b = 0; b < 1000; b++) {
    let total = 0;
    for (let j = 0; j < replicas; j++)
      total += differences[Math.floor(rng() * replicas)];
    samples.push(total / replicas);
  }
  samples.sort((a, b) => a - b);
  return {
    baseline,
    candidate,
    infectionDifference: differences.reduce((a, b) => a + b, 0) / replicas,
    interval: [samples[24], samples[974]] as [number, number],
  };
}
