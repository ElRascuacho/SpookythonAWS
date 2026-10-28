import { describe, expect, test } from "bun:test";
import { MANTA_EDGES, MANTA_NODES } from "../../domain/mantaGraph";
import { createNetworkIntroPlan, edgeIntroProgress, networkIntroDuration, nodeIntroProgress } from "../networkIntro";

describe("initial network reveal", () => {
  test("each connection starts gently and settles smoothly", () => {
    const plan = createNetworkIntroPlan([{ source: "N01", target: "A" }], "N01");
    const start = plan.edges[0].start;
    const duration = plan.edgesEnd - start;
    expect(edgeIntroProgress(0, start, plan)).toBe(0);
    expect(edgeIntroProgress(0, start + duration * 0.1, plan)).toBeLessThan(0.02);
    expect(edgeIntroProgress(0, start + duration * 0.5, plan)).toBeCloseTo(0.5);
    expect(edgeIntroProgress(0, start + duration * 0.9, plan)).toBeGreaterThan(0.98);
    expect(edgeIntroProgress(0, plan.edgesEnd, plan)).toBe(1);
  });

  test("propagates from Tarqui regardless of edge order or direction", () => {
    const edges = [
      { source: "B", target: "C" },
      { source: "A", target: "N01" },
      { source: "A", target: "B" },
    ];
    const plan = createNetworkIntroPlan(edges, "N01");
    expect(plan.edges.map(edge => edge.reverse)).toEqual([false, true, false]);
    expect(plan.edges[1].start).toBeLessThan(plan.edges[2].start);
    expect(plan.edges[2].start).toBeLessThan(plan.edges[0].start);
    expect(edgeIntroProgress(1, plan.edges[2].start, plan)).toBe(1);
    expect(edgeIntroProgress(2, plan.edges[0].start, plan)).toBe(1);
    expect(nodeIntroProgress(0, plan.edgesEnd, plan)).toBe(0);
  });

  test("reaches every Manta node and reveals labels after all connections", () => {
    const plan = createNetworkIntroPlan(MANTA_EDGES, "N01");
    const reached = new Set(["N01"]);
    for (const index of MANTA_EDGES.map((_, index) => index).sort((a, b) => plan.edges[a].start - plan.edges[b].start)) {
      const edge = MANTA_EDGES[index];
      const { reverse } = plan.edges[index];
      expect(reached.has(reverse ? edge.target : edge.source)).toBe(true);
      reached.add(reverse ? edge.source : edge.target);
      expect(edgeIntroProgress(index, plan.edgesEnd, plan)).toBe(1);
    }
    expect(reached.size).toBe(MANTA_NODES.length);
    expect(nodeIntroProgress(0, plan.edgesEnd, plan)).toBe(0);
    expect(nodeIntroProgress(0, plan.edgesEnd + 0.4, plan)).toBeGreaterThan(nodeIntroProgress(5, plan.edgesEnd + 0.4, plan));
    const end = networkIntroDuration(plan, MANTA_NODES.length);
    expect(nodeIntroProgress(15, end - 0.2, plan)).toBeLessThan(1);
    expect(nodeIntroProgress(15, end, plan)).toBe(1);
    expect(edgeIntroProgress(0, Infinity, plan)).toBe(1);
    expect(nodeIntroProgress(15, Infinity, plan)).toBe(1);
  });
});
