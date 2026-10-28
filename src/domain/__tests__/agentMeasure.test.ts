import { describe, expect, test } from "bun:test";
import { applyAgentMeasure } from "../agentMeasure";
import { newWorkspace } from "../research";
import { researchMeasure } from "./fixtures/researchMeasure";
import { runSingleSeirSimulation } from "../seirEngine";
import { resolveResearchEffects } from "../research";

const id = "c180cdbc-e84d-4524-8727-72c6e46651e7";
describe("automatic agent measure", () => {
  test("validates and activates a new measure without altering the prior workspace", () => {
    const original = newWorkspace();
    const next = applyAgentMeasure(original, researchMeasure, id, null);
    expect(original.drafts).toHaveLength(0);
    expect(next.drafts[0]).toMatchObject({ enabled: true, revision: 1, confirmedRevision: 1, confirmed: researchMeasure });
    expect(next.drafts[0].history).toHaveLength(1);
  });
  test("active measure is consumed by the real simulation engine", () => {
    const workspace = applyAgentMeasure(newWorkspace(), researchMeasure, id, null);
    const measures = workspace.drafts.filter((d) => d.enabled).map((d) => ({ id: d.id, definition: d.confirmed! }));
    const result = runSingleSeirSimulation(workspace.params, workspace.strategy, 0, undefined, undefined, {
      resolveDailyEffects: (day, state, budget) => resolveResearchEffects(day, state, budget, measures),
    });
    expect(result.timeline.some((day) => day.researchEffects?.trace.some((entry) => entry.measureId === id))).toBe(true);
  });
  test("revisions remain active and preserve history; invalid input fails closed", () => {
    const first = applyAgentMeasure(newWorkspace(), researchMeasure, id, null);
    const next = applyAgentMeasure(first, { ...researchMeasure, name: "Revisión" }, id, id);
    expect(next.drafts[0]).toMatchObject({ revision: 2, confirmedRevision: 2, enabled: true });
    expect(next.drafts[0].history).toHaveLength(2);
    expect(() => applyAgentMeasure(first, { ...researchMeasure, firstDay: 99 }, id, id)).toThrow();
    expect(() => applyAgentMeasure(first, researchMeasure, id, "missing")).toThrow();
  });
});
