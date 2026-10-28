import { describe, expect, test } from "bun:test";
import { handler } from "../workerHandler";
import { loadCommitteeResult } from "../committee/resultStore";

describe("committee worker handler", () => {
  test("runs the preview and stores it for the owner", async () => {
    delete process.env.COMMITTEE_RESULTS_BUCKET;
    const response = await handler({
      jobId: "job-worker-1",
      ownerHash: "owner-a",
      horizonDays: 20,
      baseSeed: 20261030,
    });
    expect(response.ok).toBe(true);
    expect(response.status).toBe("completed");
    const stored = await loadCommitteeResult("owner-a", "job-worker-1");
    expect(stored?.result.finalAudit).toBe("not-run");
    expect(stored?.result.playback.length).toBe(21);
    expect(await loadCommitteeResult("owner-b", "job-worker-1")).toBeNull();
  });
});
