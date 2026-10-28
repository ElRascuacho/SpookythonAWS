import { describe, test, expect } from "bun:test";
import { newWorkspace } from "../research";
import { researchMeasure } from "./fixtures/researchMeasure";
import {
  configurationHash,
  configurationIdentity,
  confirmedMeasures,
  compareResearch,
  EvidenceSchema,
  ResearchContextSchema,
  evidenceSummary,
} from "../researchEvidence";
function fixture() {
  const w = newWorkspace();
  w.params.days = 20;
  w.drafts = [
    {
      id: "12345678-1234-4234-8234-123456789abc",
      revision: 1,
      confirmedRevision: 1,
      enabled: true,
      history: [],
      definition: structuredClone(researchMeasure),
      confirmed: structuredClone(researchMeasure),
    },
  ];
  return w;
}
describe("research evidence and shared context", () => {
  test("canonical identity is stable, hashes all scientific inputs and excludes confirmation bookkeeping", async () => {
    const w = fixture(),
      hash = await configurationHash(w);
    expect(hash).toHaveLength(64);
    expect(await configurationHash(structuredClone(w))).toBe(hash);
    const changed = structuredClone(w);
    changed.params.gamma += 0.01;
    expect(await configurationHash(changed)).not.toBe(hash);
    changed.params = { ...w.params };
    changed.drafts[0].definition.numbers[0].value = 0.2;
    expect(await configurationHash(changed)).not.toBe(hash);
    const history = structuredClone(w);
    history.drafts[0].history = [{ revision: 1, definition: researchMeasure }];
    expect(configurationIdentity(history)).toBe(configurationIdentity(w));
    const policy = structuredClone(w);
    policy.strategy = "SMART_CORTAFUEGOS";
    expect(await configurationHash(policy)).not.toBe(hash);
  });
  test("rejects missing, stale or mismatched confirmations and unsupported replication counts", () => {
    const w = fixture();
    w.drafts[0].confirmedRevision = 0;
    w.drafts[0].confirmed = null;
    expect(() => confirmedMeasures(w)).toThrow();
    w.drafts[0].confirmedRevision = 1;
    w.drafts[0].confirmed = structuredClone(researchMeasure);
    w.drafts[0].definition.numbers[0].value = 0.1;
    expect(() => confirmedMeasures(w)).toThrow();
    expect(() => compareResearch(fixture(), 1 as 16)).toThrow();
    expect(() => confirmedMeasures(newWorkspace())).toThrow();
  });
  test("zero-cost zero-effect intervention has exact paired numerical parity", () => {
    const w = fixture();
    for (const m of [w.drafts[0].definition, w.drafts[0].confirmed!]) {
      m.numbers.find((n) => n.key === "reduction")!.value = 0;
      m.numbers.find((n) => n.key === "cost")!.value = 0;
    }
    const before = JSON.stringify(w),
      progress: number[] = [];
    const result = compareResearch(w, 16, (n) => progress.push(n));
    expect(result.baseline).toEqual(result.candidate);
    expect(result.infectionDifference).toBe(0);
    expect(result.interval).toEqual([0, 0]);
    expect(progress).toHaveLength(16);
    expect(JSON.stringify(w)).toBe(before);
  });
  test("effects and costs are real, reproducible, and retained with an immutable configuration", async () => {
    const w = fixture(),
      a = compareResearch(w, 16),
      b = compareResearch(w, 16);
    expect(a).toEqual(b);
    expect(a.candidate.cost).toBeGreaterThan(a.baseline.cost);
    expect(a.interval[0]).toBeLessThanOrEqual(a.interval[1]);
    const evidence = EvidenceSchema.parse({
      ...a,
      hash: await configurationHash(w),
      configuration: structuredClone(w),
      createdAt: new Date().toISOString(),
      protocol: "research-paired-v1",
      replicas: 16,
    });
    w.params.seed++;
    expect(await configurationHash(w)).not.toBe(evidence.hash);
    expect(evidenceSummary(evidence)).not.toHaveProperty("configuration");
  }, 15000);
  test("shared context rejects invented fields and future trajectories", () => {
    const w = fixture();
    const context = {
      schemaVersion: 1,
      selectedMeasure: null,
      editableParameters: w.params,
      executionParameters: null,
      configurationChanged: false,
      observed: {
        day: 0,
        infected: 1,
        exposed: 1,
        recovered: 0,
        cumulativeInfected: 2,
        hospitalCollapsed: false,
      },
      measures: [],
      evidence: null,
      evidenceCurrent: false,
      committee: null,
      committeeReadAt: null,
    };
    expect(ResearchContextSchema.safeParse(context).success).toBe(true);
    expect(
      ResearchContextSchema.safeParse({ ...context, timeline: [{ day: 40 }] })
        .success,
    ).toBe(false);
    expect(
      ResearchContextSchema.safeParse({ ...context, execute: "run()" }).success,
    ).toBe(false);
  });
});
