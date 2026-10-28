import { describe, expect, it } from "bun:test";
import { computeCommitteeStats } from "../stats";
import type { DailyCitySnapshot } from "../../types";

function createMockSnapshot(day: number, totalI: number, totalBudget = 500): DailyCitySnapshot {
  return {
    day,
    totalS: 100000 - totalI - 100,
    totalE: 50,
    totalI,
    totalR: 50,
    cumulativeInfected: 100 + day * 200,
    effectiveGamma: 0.1,
    hospitalCollapsed: totalI >= 2500,
    nodes: {},
    action: {
      day,
      budgetSpent: totalBudget,
      summaryText: `Día ${day}`,
      vaccinatedNodes: { N01: 850 },
      fumigatedNodes: ["N02"],
      cordonedNodes: ["N03"],
      cordonedEdges: [],
    },
  };
}

describe("computeCommitteeStats", () => {
  it("calculates reduction percentages and absolute savings accurately", () => {
    const snapshots: DailyCitySnapshot[] = [
      createMockSnapshot(0, 100),
      createMockSnapshot(1, 300),
      createMockSnapshot(2, 500),
    ];

    const stats = computeCommitteeStats(snapshots, 10000, 8000, { hospitalCapacity: 2500 });

    expect(stats.reductionAbsolute).toBe(2000);
    expect(stats.reductionPct).toBe(20.0);
    expect(stats.totalPopulation).toBe(100000);
    expect(stats.hospitalCapacity).toBe(2500);
    expect(stats.collapseDays).toBe(0);
    expect(stats.hospitalStatus).toBe("normal");
    expect(stats.totalVaccineDoses).toBe(850 * 3);
    expect(stats.totalFumigations).toBe(3);
    expect(stats.totalCordons).toBe(3);
    expect(stats.vaccineBudgetPct).toBeGreaterThan(0);
    expect(stats.cordonBudgetPct).toBeGreaterThan(0);
    expect(stats.fumigationBudgetPct).toBeGreaterThan(0);
    expect(stats.dailyStats.length).toBe(3);
  });

  it("handles hospital collapse and alert statuses correctly", () => {
    const snapshots: DailyCitySnapshot[] = [
      createMockSnapshot(0, 1000),
      createMockSnapshot(1, 2600), // Exceeds 2500
      createMockSnapshot(2, 2800), // Exceeds 2500
    ];

    const stats = computeCommitteeStats(snapshots, 10000, 9000, { hospitalCapacity: 2500 });
    expect(stats.collapseDays).toBe(2);
    expect(stats.hospitalStatus).toBe("colapso");
    expect(stats.peakHospitalLoadPct).toBe(112.0);
  });

  it("handles empty snapshots safely without throwing", () => {
    const stats = computeCommitteeStats([], 10000, 8500);
    expect(stats.reductionAbsolute).toBe(1500);
    expect(stats.reductionPct).toBe(15.0);
    expect(stats.dailyStats).toEqual([]);
  });
});
