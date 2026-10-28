import { describe, expect, test } from "bun:test";
import { runCommitteePreview } from "../committee/runner";

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
