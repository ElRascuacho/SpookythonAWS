import { describe, expect, test } from "bun:test";
import { handler } from "../workerHandler";
import { loadCommitteeResult } from "../committee/resultStore";

describe("committee worker handler", () => {
  test("rejects training events without creating a preview result", async () => {
    delete process.env.COMMITTEE_RESULTS_BUCKET;
    const jobId = "training-must-not-preview";
    const response = await handler({ type: "training", jobId, ownerHash: "owner-training" });
    expect(response).toEqual({ ok: false, error: "Training worker is not available" });
    expect(await loadCommitteeResult("owner-training", jobId)).toBeNull();
  });
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

  test("delegates evaluation events to the evaluation executor", async () => {
    let executedJobId = "";
    let executedOwner = "";
    const mockExecutor = {
      async execute(jobId: string, ownerHash?: string) {
        executedJobId = jobId;
        executedOwner = ownerHash ?? "";
        return { status: "completed", pairsCompleted: 4 };
      },
    };

    const response = await handler(
      {
        type: "evaluation",
        jobId: "eval-job-123",
        ownerHash: "owner-eval",
      },
      { executor: mockExecutor },
    );

    expect(response.ok).toBe(true);
    expect(response.status).toBe("completed");
    expect(response.pairsCompleted).toBe(4);
    expect(executedJobId).toBe("eval-job-123");
    expect(executedOwner).toBe("owner-eval");
  });

  test("delegates training events to the training executor when provided", async () => {
    let executedJobId = "";
    let executedOwner = "";
    const mockTrainingExecutor = {
      async execute(jobId: string, ownerHash?: string) {
        executedJobId = jobId;
        executedOwner = ownerHash ?? "";
        return { status: "completed", completedTrajectories: 3552 };
      },
    };

    const response = await handler(
      {
        type: "training",
        jobId: "train-job-456",
        ownerHash: "owner-train",
      },
      { trainingExecutor: mockTrainingExecutor },
    );

    expect(response.ok).toBe(true);
    expect(response.status).toBe("completed");
    expect(response.completedTrajectories).toBe(3552);
    expect(executedJobId).toBe("train-job-456");
    expect(executedOwner).toBe("owner-train");
  });
});
