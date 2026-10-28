import { z } from "zod";
import {
  MANTA_NODES,
  MANTA_EDGES,
  NODE_MAP,
  DEFAULT_SIMULATION_PARAMS,
} from "./mantaGraph";
import {
  SimulationParamsSchema,
  NodeIdSchema,
} from "./schemas/simulationParams.schema";
import type { CompartmentState, SimulationParams } from "./types";

const key = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const MeasureShape = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(1000),
    assumptions: z.string().min(1).max(2000),
    numbers: z
      .array(
        z
          .object({
            key,
            label: z.string().min(1).max(100),
            value: z.number(),
            min: z.number(),
            max: z.number(),
            unit: z.string().max(30),
          })
          .strict(),
      )
      .max(12),
    times: z
      .array(
        z
          .object({ key, label: z.string().min(1).max(100), value: time })
          .strict(),
      )
      .max(4),
    zones: z.array(NodeIdSchema).min(1).max(16),
    excludedEdges: z.array(z.string().max(8)).max(40),
    firstDay: z.number().int().min(1).max(60),
    lastDay: z.number().int().min(1).max(60),
    startKey: key.nullable(),
    endKey: key.nullable(),
    thresholdKey: key.nullable(),
    costKey: key,
    effects: z
      .array(
        z
          .object({
            channel: z.enum(["contacts", "mobility"]),
            reductionKey: key,
            complianceKey: key,
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();
export const MeasureSchema = MeasureShape.superRefine((m, ctx) => {
  const error = (message: string) => ctx.addIssue({ code: "custom", message });
  const keys = [...m.numbers, ...m.times].map((p) => p.key);
  if (new Set(keys).size !== keys.length)
    error("Claves de parámetros repetidas.");
  if (m.firstDay > m.lastDay) error("Calendario invertido.");
  for (const p of m.numbers)
    if (
      ![p.min, p.max, p.value].every(Number.isFinite) ||
      p.min > p.max ||
      p.value < p.min ||
      p.value > p.max ||
      Math.abs(p.min) > 1e6 ||
      Math.abs(p.max) > 1e6
    )
      error(`Rango inválido: ${p.key}`);
  const number = (k: string | null, min: number, max: number) => {
    const p = m.numbers.find((p) => p.key === k);
    if (!p || p.min < min || p.max > max)
      error(`Referencia o límites inválidos: ${k}`);
  };
  number(m.costKey, 0, 11000);
  if (m.thresholdKey) number(m.thresholdKey, 0, 1);
  for (const e of m.effects) {
    number(e.reductionKey, 0, 1);
    number(e.complianceKey, 0, 1);
  }
  if (Boolean(m.startKey) !== Boolean(m.endKey))
    error("Se requieren ambas horas o ninguna.");
  if (m.startKey && m.endKey) {
    const a = m.times.find((p) => p.key === m.startKey),
      b = m.times.find((p) => p.key === m.endKey);
    if (!a || !b || a.value === b.value)
      error("Horario inválido o duración cero.");
  }
  if (m.excludedEdges.some((id) => !MANTA_EDGES.some((e) => e.id === id)))
    error("Corredor desconocido.");
});
export type Measure = z.infer<typeof MeasureSchema>;
export const AgentReplyShape = z
  .object({
    reply: z.string().min(1).max(3000),
    proposal: MeasureShape.nullable(),
  })
  .strict();
const validateAgentProposal = (
  r: z.infer<typeof AgentReplyShape>,
  ctx: z.RefinementCtx,
) => {
  if (r.proposal) {
    const v = MeasureSchema.safeParse(r.proposal);
    if (!v.success) ctx.addIssue({ code: "custom", message: v.error.message });
  }
};
// Provider-generated content and server-added metadata have distinct contracts.
export const AgentReplySchema = AgentReplyShape.superRefine(
  validateAgentProposal,
);
export const AgentResponseSchema = AgentReplyShape.extend({
  model: z.string().min(1).max(200),
}).superRefine(validateAgentProposal);
export const DraftSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().min(1),
    confirmedRevision: z.number().int().min(0),
    enabled: z.boolean(),
    definition: MeasureSchema,
    confirmed: MeasureSchema.nullable(),
    history: z
      .array(
        z
          .object({
            revision: z.number().int().min(1),
            definition: MeasureSchema,
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict();
export type ResearchDraft = z.infer<typeof DraftSchema>;
export const WorkspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    engineVersion: z.literal("seir-research-v1").default("seir-research-v1"),
    params: SimulationParamsSchema,
    strategy: z.enum(["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"]),
    drafts: z.array(DraftSchema).max(8),
  })
  .strict()
  .superRefine((w, ctx) => {
    if (new Set(w.drafts.map((d) => d.id)).size !== w.drafts.length)
      ctx.addIssue({ code: "custom", message: "IDs repetidos." });
    for (const d of w.drafts)
      if (
        d.confirmedRevision > d.revision ||
        d.confirmedRevision > 0 !== Boolean(d.confirmed)
      )
        ctx.addIssue({
          code: "custom",
          message: "Revisión confirmada inválida.",
        });
  });
export type ResearchWorkspace = z.infer<typeof WorkspaceSchema>;
export const STORAGE_KEY = "manta-cero:research:v1";
export function newWorkspace(params?: SimulationParams): ResearchWorkspace {
  return WorkspaceSchema.parse({
    schemaVersion: 1,
    params: {
      ...DEFAULT_SIMULATION_PARAMS,
      ...params,
      days: params?.days ?? 40,
    },
    strategy: "NO_INTERVENTION",
    drafts: [],
  });
}
export function decodeWorkspace(text: string): ResearchWorkspace {
  if (text.length > 1_000_000) throw Error("El archivo supera 1 MB.");
  return WorkspaceSchema.parse(JSON.parse(text));
}
export function readWorkspace(): ResearchWorkspace | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? decodeWorkspace(raw) : null;
}
export interface EffectTrace {
  measureId: string;
  name: string;
  nodeId: string;
  applied: boolean;
  reason: string;
  cost: number;
}
export interface DailyResearchEffects {
  local: Record<string, number>;
  mobility: Record<string, number>;
  cost: number;
  trace: EffectTrace[];
}
export function resolveResearchEffects(
  day: number,
  state: Readonly<Record<string, CompartmentState>>,
  budget: number,
  measures: { id: string; definition: Measure }[],
): DailyResearchEffects {
  const local: Record<string, number> = {},
    mobility: Record<string, number> = {},
    trace: EffectTrace[] = [];
  const zones = new Map<string, { m: Measure; id: string; nodeId: string }[]>();
  let remaining = budget;
  // Stable measure order is the explicit resource priority. Zones are stable by ID.
  for (const { id, definition: m } of measures) {
    const value = (key: string) => m.numbers.find((p) => p.key === key)!.value;
    for (const nodeId of [...new Set(m.zones)].sort()) {
      const prevalence = state[nodeId].I / NODE_MAP[nodeId].population;
      const reason =
        day < m.firstDay || day > m.lastDay
          ? "Fuera del calendario"
          : m.thresholdKey && prevalence <= value(m.thresholdKey)
            ? "No supera el umbral"
            : remaining < value(m.costKey)
              ? "Presupuesto insuficiente"
              : "";
      const cost = reason ? 0 : value(m.costKey);
      remaining -= cost;
      trace.push({
        measureId: id,
        name: m.name,
        nodeId,
        applied: !reason,
        reason,
        cost,
      });
      if (!reason)
        zones.set(nodeId, [...(zones.get(nodeId) ?? []), { m, id, nodeId }]);
    }
  }
  const minutes = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  const multiplier = (items: Measure[], channel: "contacts" | "mobility") => {
    // Integrate the product at every schedule boundary: overlap is combined before averaging.
    const spans = items.map((m) => {
      if (!m.startKey) return { m, start: 0, end: 1440 };
      return {
        m,
        start: minutes(m.times.find((p) => p.key === m.startKey)!.value),
        end: minutes(m.times.find((p) => p.key === m.endKey)!.value),
      };
    });
    const bounds = [
      ...new Set([0, 1440, ...spans.flatMap((s) => [s.start, s.end])]),
    ].sort((a, b) => a - b);
    let sum = 0;
    for (let i = 0; i < bounds.length - 1; i++) {
      const t = (bounds[i] + bounds[i + 1]) / 2;
      let factor = 1;
      for (const { m, start, end } of spans) {
        if (!(start < end ? t >= start && t < end : t >= start || t < end))
          continue;
        for (const e of m.effects.filter((e) => e.channel === channel)) {
          const val = (k: string) => m.numbers.find((p) => p.key === k)!.value;
          factor *= 1 - val(e.reductionKey) * val(e.complianceKey);
        }
      }
      sum += (bounds[i + 1] - bounds[i]) * factor;
    }
    return sum / 1440;
  };
  for (const n of MANTA_NODES)
    local[n.id] = multiplier(
      (zones.get(n.id) ?? []).map((x) => x.m),
      "contacts",
    );
  for (const e of MANTA_EDGES) {
    const items = new Map<string, Measure>();
    for (const n of [e.source, e.target])
      for (const item of zones.get(n) ?? [])
        if (!item.m.excludedEdges.includes(e.id)) items.set(item.id, item.m);
    mobility[e.id] = multiplier([...items.values()], "mobility");
  }
  return { local, mobility, cost: budget - remaining, trace };
}
