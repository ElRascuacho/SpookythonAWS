import { describe, test, expect } from "bun:test";
import {
  MeasureSchema,
  newWorkspace,
  decodeWorkspace,
  resolveResearchEffects,
  WorkspaceSchema,
} from "../research";
import { runSingleSeirSimulation } from "../seirEngine";
import {
  MANTA_NODES,
  MANTA_EDGES,
  TOTAL_MANTA_POPULATION,
} from "../mantaGraph";
import { researchMeasure as fixture } from "./fixtures/researchMeasure";
const states = () =>
  Object.fromEntries(
    MANTA_NODES.map((n) => [
      n.id,
      { S: n.population - 100, E: 0, I: 100, R: 0, vectorIndex: 0.2 },
    ]),
  );
describe("research measures and shared engine", () => {
  test("validates bounded references, time and node IDs; rejects executable/unknown fields", () => {
    expect(MeasureSchema.safeParse(fixture).success).toBe(true);
    for (const patch of [
      { costKey: "missing" },
      { lastDay: 0 },
      { zones: ["XX"] },
      { script: "alert(1)" },
      { endKey: "start" },
      {
        numbers: fixture.numbers.map((n) =>
          n.key === "reduction" ? { ...n, value: 2 } : n,
        ),
      },
    ])
      expect(MeasureSchema.safeParse({ ...fixture, ...patch }).success).toBe(
        false,
      );
  });
  test("integrates cross-midnight schedule, charge once per zone and exclude corridor", () => {
    const edge = MANTA_EDGES.find(
      (e) => e.source === "N01" || e.target === "N01",
    )!;
    const m = { ...fixture, excludedEdges: [edge.id] };
    const r = resolveResearchEffects(1, states(), 7500, [
      { id: "a", definition: m },
    ]);
    expect(r.cost).toBe(240);
    expect(r.mobility[edge.id]).toBe(1);
    const active = MANTA_EDGES.find(
      (e) => e.id !== edge.id && (e.source === "N01" || e.target === "N01"),
    )!;
    expect(r.mobility[active.id]).toBeCloseTo(1 - (7 / 24) * 0.6 * 0.7);
  });
  test("combines overlapping schedules BEFORE daily integration", () => {
    const a = {
      ...fixture,
      zones: ["N01"] as typeof fixture.zones,
      effects: [{ ...fixture.effects[0], channel: "contacts" as const }],
    };
    const r = resolveResearchEffects(1, states(), 7500, [
      { id: "a", definition: a },
      { id: "b", definition: a },
    ]);
    expect(r.local.N01).toBeCloseTo(
      17 / 24 + (7 / 24) * Math.pow(1 - 0.6 * 0.7, 2),
    );
  });
  test("budget, calendar and prevalence omit effects and costs deterministically", () => {
    const r = resolveResearchEffects(1, states(), 130, [
      { id: "a", definition: fixture },
    ]);
    expect(r.cost).toBe(120);
    expect(r.trace[1].reason).toBe("Presupuesto insuficiente");
    expect(
      resolveResearchEffects(0, states(), 7500, [
        { id: "a", definition: fixture },
      ]).cost,
    ).toBe(0);
    expect(
      resolveResearchEffects(1, states(), 7500, [
        { id: "a", definition: { ...fixture, thresholdKey: "compliance" } },
      ]).cost,
    ).toBe(0);
  });
  test("empty extension has numerical parity, existing fifth graph argument remains intact", () => {
    const p = { ...newWorkspace().params, days: 4 };
    for (const strategy of [
      "NO_INTERVENTION",
      "RANDOM",
      "SMART_CORTAFUEGOS",
    ] as const) {
      const a = runSingleSeirSimulation(p, strategy, 0);
      const b = runSingleSeirSimulation(
        p,
        strategy,
        0,
        undefined,
        undefined,
        {},
      );
      expect(a).toEqual(b);
    }
  });
  test("measures change actual SEIR outcomes and stay reproducible, conservative and budget-bounded", () => {
    const p = { ...newWorkspace().params, days: 15 };
    const m = {
      ...fixture,
      startKey: null,
      endKey: null,
      zones: MANTA_NODES.map((n) => n.id) as typeof fixture.zones,
      numbers: fixture.numbers.map((n) =>
        n.key === "reduction" || n.key === "compliance"
          ? { ...n, value: 1 }
          : n,
      ),
      effects: [
        {
          channel: "contacts" as const,
          reductionKey: "reduction",
          complianceKey: "compliance",
        },
        {
          channel: "mobility" as const,
          reductionKey: "reduction",
          complianceKey: "compliance",
        },
      ],
    };
    const opts = {
      resolveDailyEffects: (
        day: number,
        s: ReturnType<typeof states>,
        budget: number,
      ) => resolveResearchEffects(day, s, budget, [{ id: "a", definition: m }]),
    };
    const a = runSingleSeirSimulation(
      p,
      "NO_INTERVENTION",
      0,
      undefined,
      undefined,
      opts,
    );
    expect(a).toEqual(
      runSingleSeirSimulation(
        p,
        "NO_INTERVENTION",
        0,
        undefined,
        undefined,
        opts,
      ),
    );
    expect(a.totalCumulativeInfected).toBeLessThan(
      runSingleSeirSimulation(p, "NO_INTERVENTION", 0).totalCumulativeInfected,
    );
    for (const t of a.timeline) {
      expect(t.totalS + t.totalE + t.totalI + t.totalR).toBe(
        TOTAL_MANTA_POPULATION,
      );
      expect(t.action.budgetSpent).toBeLessThanOrEqual(p.dailyBudget);
      for (const n of Object.values(t.nodes))
        expect(Math.min(n.S, n.E, n.I, n.R)).toBeGreaterThanOrEqual(0);
    }
    const b = runSingleSeirSimulation(
      p,
      "SMART_CORTAFUEGOS",
      0,
      undefined,
      undefined,
      opts,
    );
    for (const t of b.timeline)
      expect(t.action.budgetSpent).toBeLessThanOrEqual(p.dailyBudget);
  });
  test("versioned import rejects malformed input without executing expressions", () => {
    const w = newWorkspace();
    expect(decodeWorkspace(JSON.stringify(w))).toEqual(w);
    expect(() => decodeWorkspace("{")).toThrow();
    expect(WorkspaceSchema.safeParse({ ...w, schemaVersion: 2 }).success).toBe(
      false,
    );
    expect(() => decodeWorkspace("x".repeat(1_000_001))).toThrow();
  });
});
