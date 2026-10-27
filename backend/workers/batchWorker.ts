import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { runSingleSeirSimulation } from "../../src/domain/seirEngine";
import {
  SimulationParams,
  SingleSimulationRunResult,
  StrategyType,
} from "../../src/domain/types";
import { DEFAULT_SIMULATION_PARAMS } from "../../src/domain/mantaGraph";
import { S3StorageService } from "../storage/s3Client";
import { InMemoryDatabase } from "../storage/inMemoryDatabase";

export interface BatchWorkerInput {
  jobId: string;
  attempt: number;
  strategy: StrategyType | "AI_CORTAFUEGOS";
  batchIndex: number;
  startRunIndex: number;
  runsCount: number;
  params?: Partial<SimulationParams>;
  aiPolicySpec?: any;
}

export interface BatchWorkerDependencies {
  db: InMemoryDatabase;
  s3: S3StorageService;
}

export interface BatchWorkerOutput {
  ok: boolean;
  jobId: string;
  attempt: number;
  strategy: string;
  batchIndex: number;
  runsProcessed: number;
  s3BatchKey: string;
  alreadyProcessed?: boolean;
}

export async function executeBatchWorker(
  input: BatchWorkerInput,
  deps: BatchWorkerDependencies,
): Promise<BatchWorkerOutput> {
  const {
    jobId,
    attempt,
    strategy,
    batchIndex,
    startRunIndex,
    runsCount,
    params: userParams = {},
    aiPolicySpec = null,
  } = input;

  const receiptSK = `ATTEMPT#${attempt}#BATCH#${strategy}#${batchIndex}`;
  const s3BatchKey = `jobs/${jobId}/attempts/${attempt}/batches/${strategy}_${batchIndex}.json.gz`;

  // 1. Idempotency Check / Attempt Fencing in DynamoDB
  const existingReceipt = await deps.db.getItem(`JOB#${jobId}`, receiptSK);
  if (existingReceipt) {
    return {
      ok: true,
      jobId,
      attempt,
      strategy,
      batchIndex,
      runsProcessed: existingReceipt.runsCount ?? runsCount,
      s3BatchKey,
      alreadyProcessed: true,
    };
  }

  // 2. Merge Parameters
  const params: SimulationParams = {
    ...DEFAULT_SIMULATION_PARAMS,
    ...userParams,
    patientZeroIds:
      userParams.patientZeroIds && userParams.patientZeroIds.length > 0
        ? [...userParams.patientZeroIds]
        : [...DEFAULT_SIMULATION_PARAMS.patientZeroIds],
  };

  // 3. Execute Monte Carlo batch
  const strategyForEngine = (strategy === "AI_CORTAFUEGOS" ? "SMART_CORTAFUEGOS" : strategy) as StrategyType;
  const runs: any[] = [];

  for (let r = 0; r < runsCount; r++) {
    const runIndex = startRunIndex + r;
    const singleRun: SingleSimulationRunResult = runSingleSeirSimulation(
      params,
      strategyForEngine,
      runIndex,
    );

    if (runIndex === 0) {
      // Full run 0 with complete node breakdowns for 3D map playback
      runs.push(singleRun);
    } else {
      // Optimized run payload: strip large node maps to preserve memory and Lambda payload
      const compactTimeline = singleRun.timeline.map((snap) => ({
        day: snap.day,
        totalS: snap.totalS,
        totalE: snap.totalE,
        totalI: snap.totalI,
        totalR: snap.totalR,
        cumulativeInfected: snap.cumulativeInfected,
        effectiveGamma: snap.effectiveGamma,
        hospitalCollapsed: snap.hospitalCollapsed,
        action: {
          day: snap.action.day,
          budgetSpent: snap.action.budgetSpent,
          summaryText: snap.action.summaryText,
        },
      }));

      runs.push({
        strategy: singleRun.strategy,
        runIndex: singleRun.runIndex,
        seedUsed: singleRun.seedUsed,
        timeline: compactTimeline,
        peakZombies: singleRun.peakZombies,
        peakDay: singleRun.peakDay,
        totalCumulativeInfected: singleRun.totalCumulativeInfected,
        totalVaccinesUsed: singleRun.totalVaccinesUsed,
        wastedDosesOnInfected: singleRun.wastedDosesOnInfected,
        totalBudgetSpent: singleRun.totalBudgetSpent,
        hospitalCollapseDays: singleRun.hospitalCollapseDays,
      });
    }
  }

  // 4. Compress to Gzip
  const rawPayload = JSON.stringify({
    jobId,
    attempt,
    strategy,
    batchIndex,
    startRunIndex,
    runsCount,
    runs,
  });

  const compressedBuffer = gzipSync(Buffer.from(rawPayload, "utf-8"));
  const checksum = createHash("sha256").update(compressedBuffer).digest("hex");

  // 5. Persist to S3
  await deps.s3.putObject(s3BatchKey, compressedBuffer, {
    "x-amz-meta-job-id": jobId,
    "x-amz-meta-attempt": String(attempt),
    "x-amz-meta-strategy": strategy,
    "x-amz-meta-batch-index": String(batchIndex),
  });

  // 6. Record receipt in DynamoDB with attempt fencing
  await deps.db.putItem({
    PK: `JOB#${jobId}`,
    SK: receiptSK,
    jobId,
    attempt,
    strategy,
    batchIndex,
    startRunIndex,
    endRunIndex: startRunIndex + runsCount - 1,
    runsCount,
    s3BatchKey,
    checksum,
    processedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    jobId,
    attempt,
    strategy,
    batchIndex,
    runsProcessed: runsCount,
    s3BatchKey,
    alreadyProcessed: false,
  };
}
