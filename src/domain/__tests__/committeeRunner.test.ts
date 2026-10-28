import { describe, expect, test } from "bun:test";
import { runCommitteePreview } from "../committee/runner";
import type { SeedPools } from "../committee/types";

function tinyPools(): SeedPools {
  const pool = (start: number, size: number) => ({
    size,
    runIndices: Object.freeze(Array.from({ length: size }, (_, index) => start + index)),
  });
  return {
    baseline: pool(0, 2),
    train: pool(10, 2),
    selection: pool(100, 2),
    promotion: pool(200, 2),
    final: pool(400, 2),
  };
}

describe("committee local preview runner", () => {
  test("returns a baseline playback and stays inside a small trajectory budget", () => {
    const result = runCommitteePreview({
      jobId: "job-preview",
      baseSeed: 20261030,
      horizonDays: 20,
      limits: { generations: 1, trainIndices: [0] },
    });
    expect(result.status).toBe("completed");
    expect(result.finalAudit).toBe("not-run");
    expect(result.recommendedPolicyVersion).toBe(0);
    expect(result.playback).toHaveLength(21);
    expect(result.trajectories).toBeLessThanOrEqual(30);
    expect(result.baselineMean).toBeGreaterThan(0);
  });

  test("promotion on a small pool can keep the baseline when the candidate does not win", () => {
    const result = runCommitteePreview({
      jobId: "job-promotion",
      baseSeed: 20261030,
      horizonDays: 20,
      pools: tinyPools(),
      limits: { generations: 1, trainIndices: [10], includePromotion: true },
    });
    expect(result.finalAudit).toBe("not-run");
    expect(result.note).toContain("Promoción");
    expect(result.recommendedPolicyVersion === 0 || result.recommendedPolicyVersion === 1).toBe(true);
  });

  test("stops when cancel is requested before the next trajectory", () => {
    let seen = 0;
    const result = runCommitteePreview({
      jobId: "job-cancel",
      baseSeed: 7,
      horizonDays: 20,
      limits: { generations: 1, trainIndices: [0] },
      shouldCancel: () => {
        seen += 1;
        return seen > 2;
      },
    });
    expect(result.status).toBe("cancelled");
    expect(result.finalAudit).toBe("not-run");
    expect(result.weights).toEqual([0, 0, 0, 0]);
  });
});
