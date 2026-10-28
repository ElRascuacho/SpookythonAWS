import { describe, expect, it } from "bun:test";
import { runCommitteePreview } from "../runner";

describe("runCommitteePreview with audit", () => {
  it("runs full promotion and final audit when requested", () => {
    const result = runCommitteePreview({
      jobId: "test-audit-job",
      baseSeed: 20261030,
      horizonDays: 20,
      limits: {
        generations: 1,
        includePromotion: true,
        includeFinalAudit: true,
      },
    });

    expect(result.status).toBe("completed");
    expect(["passed", "failed"]).toContain(result.finalAudit);
    expect(result.trajectories).toBeGreaterThan(10);
    expect(result.playback.length).toBe(21);
  }, 20000);
});
