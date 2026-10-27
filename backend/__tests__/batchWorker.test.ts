import { describe, expect, it, beforeEach } from "bun:test";
import { runSingleSeirSimulation } from "../../src/domain/seirEngine";
import { DEFAULT_SIMULATION_PARAMS } from "../../src/domain/mantaGraph";
import { executeBatchWorker, BatchWorkerInput } from "../workers/batchWorker";
import { S3StorageService } from "../storage/s3Client";
import { InMemoryDatabase } from "../storage/inMemoryDatabase";
import { gunzipSync } from "node:zlib";

describe("Task 04: Monte Carlo Batch Worker", () => {
  let db: InMemoryDatabase;
  let s3: S3StorageService;

  beforeEach(() => {
    db = new InMemoryDatabase();
    s3 = new S3StorageService({ bucketName: "spookython-sim-results-test", localMode: true });
  });

  it("completes a batch of 25 runs in < 2.5 seconds", async () => {
    const input: BatchWorkerInput = {
      jobId: "019488a0-711e-7f61-b68e-9cb2657e4e11",
      attempt: 1,
      strategy: "SMART_CORTAFUEGOS",
      batchIndex: 0,
      startRunIndex: 0,
      runsCount: 25,
      params: {
        ...DEFAULT_SIMULATION_PARAMS,
        days: 30, // 30 days for fast unit test
        monteCarloRuns: 25,
      },
    };

    const startTime = performance.now();
    const result = await executeBatchWorker(input, { db, s3 });
    const elapsedMs = performance.now() - startTime;

    expect(result.ok).toBe(true);
    expect(result.runsProcessed).toBe(25);
    expect(elapsedMs).toBeLessThan(2500);
  });

  it("guarantees 100% bit-identical mathematical parity with monolithic engine", async () => {
    const params = {
      ...DEFAULT_SIMULATION_PARAMS,
      days: 30,
      seed: 20261030,
    };

    const input: BatchWorkerInput = {
      jobId: "job-parity-test",
      attempt: 1,
      strategy: "SMART_CORTAFUEGOS",
      batchIndex: 0,
      startRunIndex: 0,
      runsCount: 5,
      params,
    };

    const batchResult = await executeBatchWorker(input, { db, s3 });
    expect(batchResult.ok).toBe(true);

    // Read the S3 batch file
    const compressedBuffer = await s3.getObject(batchResult.s3BatchKey);
    const uncompressed = gunzipSync(compressedBuffer).toString("utf-8");
    const payload = JSON.parse(uncompressed);

    // Compare each run directly with runSingleSeirSimulation
    for (let r = 0; r < 5; r++) {
      const reference = runSingleSeirSimulation(params, "SMART_CORTAFUEGOS", r);
      const batchRun = payload.runs[r];

      expect(batchRun.totalCumulativeInfected).toBe(reference.totalCumulativeInfected);
      expect(batchRun.peakZombies).toBe(reference.peakZombies);
      expect(batchRun.peakDay).toBe(reference.peakDay);
      expect(batchRun.totalVaccinesUsed).toBe(reference.totalVaccinesUsed);
      expect(batchRun.wastedDosesOnInfected).toBe(0);
      expect(batchRun.totalBudgetSpent).toBe(reference.totalBudgetSpent);
      expect(batchRun.hospitalCollapseDays).toBe(reference.hospitalCollapseDays);
    }
  });

  it("stores full node timeline ONLY for run0, and optimized scalars for other runs", async () => {
    const input: BatchWorkerInput = {
      jobId: "job-timeline-opt",
      attempt: 1,
      strategy: "RANDOM",
      batchIndex: 0,
      startRunIndex: 0,
      runsCount: 3,
      params: { ...DEFAULT_SIMULATION_PARAMS, days: 10 },
    };

    const res = await executeBatchWorker(input, { db, s3 });
    const raw = gunzipSync(await s3.getObject(res.s3BatchKey)).toString("utf-8");
    const data = JSON.parse(raw);

    // run 0 must have node snapshots for 3D map
    expect(data.runs[0].timeline[0].nodes).toBeDefined();
    expect(Object.keys(data.runs[0].timeline[0].nodes).length).toBe(16);

    // run 1 and 2 must have stripped nodes to save payload, keeping scalar totals
    expect(data.runs[1].timeline[0].nodes).toBeUndefined();
    expect(data.runs[1].timeline[0].totalI).toBeDefined();
    expect(data.runs[1].timeline[0].totalS).toBeDefined();
  });

  it("registers an idempotent batch receipt in DynamoDB with attempt fencing", async () => {
    const input: BatchWorkerInput = {
      jobId: "job-fencing-test",
      attempt: 2,
      strategy: "NO_INTERVENTION",
      batchIndex: 3,
      startRunIndex: 75,
      runsCount: 25,
      params: { ...DEFAULT_SIMULATION_PARAMS, days: 15 },
    };

    const res = await executeBatchWorker(input, { db, s3 });
    expect(res.ok).toBe(true);

    // Verify receipt in DynamoDB
    const receiptKey = `ATTEMPT#2#BATCH#NO_INTERVENTION#3`;
    const receipt = await db.getItem(`JOB#job-fencing-test`, receiptKey);
    expect(receipt).toBeDefined();
    expect(receipt?.runsCount).toBe(25);
    expect(receipt?.attempt).toBe(2);
    expect(receipt?.s3BatchKey).toBe(res.s3BatchKey);

    // Attempting duplicate put with same receipt must be idempotent without failure
    const retryRes = await executeBatchWorker(input, { db, s3 });
    expect(retryRes.ok).toBe(true);
    expect(retryRes.alreadyProcessed).toBe(true);
  });
});
