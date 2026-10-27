import { describe, expect, it, beforeEach } from "bun:test";
import { executeAggregator, AggregatorInput } from "../workers/aggregator";
import { executeBatchWorker, BatchWorkerInput } from "../workers/batchWorker";
import { runMonteCarloComparison } from "../../src/domain/monteCarlo";
import { DEFAULT_SIMULATION_PARAMS } from "../../src/domain/mantaGraph";
import { InMemoryDatabase } from "../storage/inMemoryDatabase";
import { S3StorageService } from "../storage/s3Client";
import { InvitationService } from "../auth/invitationService";
import { JobAdmissionService } from "../services/jobAdmissionService";

describe("Task 05: Aggregator & Exactly-Once Finalizer", () => {
  let db: InMemoryDatabase;
  let s3: S3StorageService;
  let invitationService: InvitationService;
  let jobAdmissionService: JobAdmissionService;

  beforeEach(() => {
    db = new InMemoryDatabase();
    s3 = new S3StorageService({ bucketName: "spookython-sim-results-test", localMode: true });
    invitationService = new InvitationService(db);
    jobAdmissionService = new JobAdmissionService(db);
  });

  it("fails cleanly with INCOMPLETE_BATCH_MANIFEST when a batch is missing", async () => {
    const inv = await invitationService.createInvitation({ label: "Tester" });
    const job = await jobAdmissionService.admitJob({
      invitationId: inv.invitationId,
      params: { days: 15, monteCarloRuns: 50 },
    });

    const aggInput: AggregatorInput = {
      jobId: job.jobId,
      attempt: 1,
      strategies: ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"],
      batchesPerStrategy: 2, // expects batch 0 and 1
      runsPerBatch: 25,
      params: { ...DEFAULT_SIMULATION_PARAMS, days: 15, monteCarloRuns: 50 },
    };

    // We only execute batch 0, leaving batch 1 missing
    await executeBatchWorker(
      {
        jobId: job.jobId,
        attempt: 1,
        strategy: "NO_INTERVENTION",
        batchIndex: 0,
        startRunIndex: 0,
        runsCount: 25,
        params: { ...DEFAULT_SIMULATION_PARAMS, days: 15 },
      },
      { db, s3 },
    );

    const result = await executeAggregator(aggInput, { db, s3 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("INCOMPLETE_BATCH_MANIFEST");

    // The job should be marked FAILED and slot must be released
    const jobItem = await db.getItem(`JOB#${job.jobId}`, "METADATA");
    expect(jobItem?.status).toBe("FAILED");
    expect(jobItem?.slotReleased).toBe(true);

    const invItem = await db.getItem(`INV#${inv.invitationId}`, "METADATA");
    expect(invItem?.activeJobsCount).toBe(0);
  });

  it(
    "guarantees 100% bit-identical mathematical parity with monolithic comparison",
    async () => {
      const inv = await invitationService.createInvitation({ label: "Tester 2" });
      const params = {
        ...DEFAULT_SIMULATION_PARAMS,
        days: 15,
        monteCarloRuns: 25,
        seed: 20261030,
      };

      const job = await jobAdmissionService.admitJob({
        invitationId: inv.invitationId,
        params: params as any,
      });

      const strategies = ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"] as const;

      // Execute 1 batch of 25 runs = 25 runs for each strategy
      for (const strat of strategies) {
        await executeBatchWorker(
          {
            jobId: job.jobId,
            attempt: 1,
            strategy: strat,
            batchIndex: 0,
            startRunIndex: 0,
            runsCount: 25,
            params: params as any,
          },
          { db, s3 },
        );
      }

      const startTime = performance.now();
      const aggResult = await executeAggregator(
        {
          jobId: job.jobId,
          attempt: 1,
          strategies: [...strategies],
          batchesPerStrategy: 1,
          runsPerBatch: 25,
          params: params as any,
        },
        { db, s3 },
      );
      const aggDuration = performance.now() - startTime;

      expect(aggResult.ok).toBe(true);
    expect(aggDuration).toBeLessThan(3500);

    // Reference monolithic comparison
    const referenceResult = runMonteCarloComparison(params);

    // Compare aggregated strategies with reference
    for (const strat of strategies) {
      const aggSummary = aggResult.comparisonResult.strategies[strat];
      const refSummary = referenceResult.strategies[strat];

      expect(aggSummary.meanTotalInfected).toBe(refSummary.meanTotalInfected);
      expect(aggSummary.p10TotalInfected).toBe(refSummary.p10TotalInfected);
      expect(aggSummary.p90TotalInfected).toBe(refSummary.p90TotalInfected);
      expect(aggSummary.meanPeakZombies).toBe(refSummary.meanPeakZombies);
      expect(aggSummary.p10PeakZombies).toBe(refSummary.p10PeakZombies);
      expect(aggSummary.p90PeakZombies).toBe(refSummary.p90PeakZombies);
      expect(aggSummary.meanLivesSavedVsBaseline).toBe(refSummary.meanLivesSavedVsBaseline);
      expect(aggSummary.p10LivesSavedVsBaseline).toBe(refSummary.p10LivesSavedVsBaseline);
      expect(aggSummary.p90LivesSavedVsBaseline).toBe(refSummary.p90LivesSavedVsBaseline);
      expect(aggSummary.zeroWastedVaccinesVerified).toBe(true);

      // Verify representativeRun (run 0)
      expect(aggSummary.representativeRun.peakZombies).toBe(refSummary.representativeRun.peakZombies);
      expect(aggSummary.representativeRun.timeline.length).toBe(params.days + 1);
      expect(aggSummary.representativeRun.timeline[0].nodes).toBeDefined();
    }
  });

  it("finalizes job exactly once: releases concurrency slot and forbids duplicate decrement", async () => {
    const inv = await invitationService.createInvitation({ label: "Tester 3" });
    const job = await jobAdmissionService.admitJob({
      invitationId: inv.invitationId,
      params: { days: 10, monteCarloRuns: 25 },
    });

    const strategies = ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"] as const;
    for (const strat of strategies) {
      await executeBatchWorker(
        {
          jobId: job.jobId,
          attempt: 1,
          strategy: strat,
          batchIndex: 0,
          startRunIndex: 0,
          runsCount: 25,
          params: { ...DEFAULT_SIMULATION_PARAMS, days: 10 },
        },
        { db, s3 },
      );
    }

    const aggInput: AggregatorInput = {
      jobId: job.jobId,
      attempt: 1,
      strategies: [...strategies],
      batchesPerStrategy: 1,
      runsPerBatch: 25,
      params: { ...DEFAULT_SIMULATION_PARAMS, days: 10, monteCarloRuns: 25 },
    };

    const firstRun = await executeAggregator(aggInput, { db, s3 });
    expect(firstRun.ok).toBe(true);

    const jobItem = await db.getItem(`JOB#${job.jobId}`, "METADATA");
    expect(jobItem?.status).toBe("COMPLETED");
    expect(jobItem?.slotReleased).toBe(true);
    expect(jobItem?.GSI3PK).toBeUndefined(); // Removed from active GSI3 index

    const invItem = await db.getItem(`INV#${inv.invitationId}`, "METADATA");
    expect(invItem?.activeJobsCount).toBe(0);

    // Second call to aggregator (e.g. Step Functions retry or late invocation)
    const secondRun = await executeAggregator(aggInput, { db, s3 });
    expect(secondRun.ok).toBe(true);
    expect(secondRun.alreadyFinalized).toBe(true);

    // activeJobsCount must NOT be decremented to -1
    const invItemAfter = await db.getItem(`INV#${inv.invitationId}`, "METADATA");
    expect(invItemAfter?.activeJobsCount).toBe(0);
  });
});
