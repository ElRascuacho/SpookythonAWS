import { gunzipSync } from "node:zlib";
import {
  computeMean,
  computePercentile,
  computeStdDev,
} from "../math/percentileAggregator";
import {
  DailyBandPoint,
  MonteCarloComparisonResult,
  SimulationParams,
  SingleSimulationRunResult,
  StrategyMonteCarloSummary,
  StrategyType,
} from "../../src/domain/types";
import { DEFAULT_SIMULATION_PARAMS, TOTAL_MANTA_POPULATION } from "../../src/domain/mantaGraph";
import { S3StorageService } from "../storage/s3Client";
import { InMemoryDatabase } from "../storage/inMemoryDatabase";

const STRATEGY_LABELS: Record<string, string> = {
  NO_INTERVENTION: "Línea Base 1: Sin Intervención",
  RANDOM: "Línea Base 2: Intervención al Azar",
  SMART_CORTAFUEGOS: "Nuestra Estrategia: Smart Graph Cortafuegos",
  AI_CORTAFUEGOS: "Estrategia Asistida por IA (Nova Micro)",
};

export interface AggregatorInput {
  jobId: string;
  attempt?: number;
  strategies?: string[];
  batchesPerStrategy?: number;
  runsPerBatch?: number;
  params?: Partial<SimulationParams>;
}

export interface AggregatorDependencies {
  db: InMemoryDatabase;
  s3: S3StorageService;
}

export interface AggregatorOutput {
  ok: boolean;
  jobId: string;
  comparisonResult?: any;
  s3ResultsKey?: string;
  alreadyFinalized?: boolean;
  error?: string;
}

export async function executeAggregator(
  input: AggregatorInput,
  deps: AggregatorDependencies,
): Promise<AggregatorOutput> {
  const {
    jobId,
    attempt = 1,
    strategies = ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"],
    batchesPerStrategy = 20,
    runsPerBatch = 25,
    params: userParams = {},
  } = input;

  const jobItem = await deps.db.getItem(`JOB#${jobId}`, "METADATA");
  if (!jobItem) {
    throw new Error(`Trabajo ${jobId} no encontrado.`);
  }

  // Idempotency: if already finalized, return immediately without touching slots
  if (jobItem.slotReleased === true && jobItem.status === "COMPLETED") {
    return {
      ok: true,
      jobId,
      alreadyFinalized: true,
      s3ResultsKey: jobItem.s3ResultsKey,
      comparisonResult: jobItem.resultsPayload,
    };
  }

  const params: SimulationParams = {
    ...DEFAULT_SIMULATION_PARAMS,
    ...userParams,
    ...jobItem.scenarioParams,
    days: userParams.days ?? jobItem.scenarioParams?.days ?? DEFAULT_SIMULATION_PARAMS.days,
  };

  // 1. Manifest Validation: check all expected batch files in S3
  const expectedBatchKeys: Array<{ strategy: string; batchIndex: number; key: string }> = [];
  for (const strategy of strategies) {
    for (let b = 0; b < batchesPerStrategy; b++) {
      const key = `jobs/${jobId}/attempts/${attempt}/batches/${strategy}_${b}.json.gz`;
      expectedBatchKeys.push({ strategy, batchIndex: b, key });
    }
  }

  for (const batch of expectedBatchKeys) {
    const exists = await deps.s3.hasObject(batch.key);
    if (!exists) {
      // Incomplete manifest: fail the job cleanly and release slot
      if (!jobItem.slotReleased) {
        await deps.db.transactWrite([
          {
            type: "Update",
            PK: `JOB#${jobId}`,
            SK: "METADATA",
            condition: (item) => Boolean(item && item.slotReleased === false),
            update: (item) => {
              item.status = "FAILED";
              item.slotReleased = true;
              item.failureReason = "INCOMPLETE_BATCH_MANIFEST";
              delete item.GSI3PK;
              delete item.GSI3SK;
            },
          },
          {
            type: "Update",
            PK: `INV#${jobItem.invitationId}`,
            SK: "METADATA",
            condition: (item) => Boolean(item && (item.activeJobsCount ?? 0) > 0),
            update: (item) => {
              item.activeJobsCount = Math.max(0, (item.activeJobsCount ?? 1) - 1);
            },
          },
        ]);
      }

      return {
        ok: false,
        jobId,
        error: "INCOMPLETE_BATCH_MANIFEST",
      };
    }
  }

  // 2. Load and decompress all batches
  const rawRunsByStrategy: Record<string, any[]> = {};
  for (const strategy of strategies) {
    rawRunsByStrategy[strategy] = [];
  }

  for (const batch of expectedBatchKeys) {
    const compressed = await deps.s3.getObject(batch.key);
    const uncompressed = gunzipSync(compressed).toString("utf-8");
    const parsed = JSON.parse(uncompressed);
    rawRunsByStrategy[batch.strategy].push(...parsed.runs);
  }

  // Sort each strategy's runs by runIndex
  for (const strategy of strategies) {
    rawRunsByStrategy[strategy].sort((a, b) => a.runIndex - b.runIndex);
  }

  // 3. Compute statistical bands and summary metrics
  const baselineRuns = rawRunsByStrategy["NO_INTERVENTION"] || rawRunsByStrategy[strategies[0]];
  const summaries: Record<string, StrategyMonteCarloSummary> = {};

  for (const strategy of strategies) {
    const runs = rawRunsByStrategy[strategy];
    const dailyBands: DailyBandPoint[] = [];

    for (let day = 0; day <= params.days; day++) {
      const activeI: number[] = [];
      const activeE: number[] = [];
      const activeS: number[] = [];
      const activeR: number[] = [];
      const cumInf: number[] = [];

      for (let r = 0; r < runs.length; r++) {
        const snap = runs[r].timeline[day];
        if (snap) {
          activeI.push(snap.totalI);
          activeE.push(snap.totalE);
          activeS.push(snap.totalS);
          activeR.push(snap.totalR);
          cumInf.push(snap.cumulativeInfected);
        }
      }

      const sortedI = [...activeI].sort((a, b) => a - b);
      const sortedCum = [...cumInf].sort((a, b) => a - b);

      dailyBands.push({
        day,
        meanActiveZombies: Math.round(computeMean(activeI)),
        p10ActiveZombies: computePercentile(sortedI, 10),
        p90ActiveZombies: computePercentile(sortedI, 90),
        meanExposed: Math.round(computeMean(activeE)),
        meanSusceptible: Math.round(computeMean(activeS)),
        meanRecovered: Math.round(computeMean(activeR)),
        meanCumulativeInfected: Math.round(computeMean(cumInf)),
        p10CumulativeInfected: computePercentile(sortedCum, 10),
        p90CumulativeInfected: computePercentile(sortedCum, 90),
      });
    }

    const totalInfectedList = runs.map((r) => r.totalCumulativeInfected);
    const sortedTotalInfected = [...totalInfectedList].sort((a, b) => a - b);
    const meanTotalInfected = Math.round(computeMean(totalInfectedList));
    const stdDevTotalInfected = Math.round(computeStdDev(totalInfectedList, meanTotalInfected));

    const peakZombiesList = runs.map((r) => r.peakZombies);
    const sortedPeakZombies = [...peakZombiesList].sort((a, b) => a - b);

    // Pairwise lives saved vs NO_INTERVENTION run-by-run
    const livesSavedList = runs.map((r, idx) =>
      Math.max(0, (baselineRuns[idx]?.totalCumulativeInfected ?? r.totalCumulativeInfected) - r.totalCumulativeInfected),
    );
    const sortedLivesSaved = [...livesSavedList].sort((a, b) => a - b);
    const meanLivesSaved = Math.round(computeMean(livesSavedList));

    const meanCollapseDays = Number(
      computeMean(runs.map((r) => r.hospitalCollapseDays)).toFixed(1),
    );
    const meanBudgetSpent = Math.round(computeMean(runs.map((r) => r.totalBudgetSpent)));
    const costPerLifeSaved =
      meanLivesSaved > 0 ? Number((meanBudgetSpent / meanLivesSaved).toFixed(2)) : 0;

    const zeroWastedVaccinesVerified = runs.every((r) => r.wastedDosesOnInfected === 0);

    summaries[strategy] = {
      strategy: strategy as StrategyType,
      label: STRATEGY_LABELS[strategy] || strategy,
      dailyBands,
      representativeRun: runs[0],
      meanTotalInfected,
      p10TotalInfected: computePercentile(sortedTotalInfected, 10),
      p90TotalInfected: computePercentile(sortedTotalInfected, 90),
      stdDevTotalInfected,
      meanPeakZombies: Math.round(computeMean(peakZombiesList)),
      p10PeakZombies: computePercentile(sortedPeakZombies, 10),
      p90PeakZombies: computePercentile(sortedPeakZombies, 90),
      meanLivesSavedVsBaseline: meanLivesSaved,
      p10LivesSavedVsBaseline: computePercentile(sortedLivesSaved, 10),
      p90LivesSavedVsBaseline: computePercentile(sortedLivesSaved, 90),
      meanHospitalCollapseDays: meanCollapseDays,
      meanBudgetSpent,
      costPerLifeSaved,
      zeroWastedVaccinesVerified,
    };
  }

  const comparisonResult: MonteCarloComparisonResult = {
    params,
    computedAtIso: new Date().toISOString(),
    executionTimeMs: 0,
    totalPopulation: TOTAL_MANTA_POPULATION,
    strategies: summaries as any,
  };

  // 4. Upload final consolidated JSON to S3
  const s3ResultsKey = `jobs/${jobId}/attempts/${attempt}/results.json`;
  const resultsBuffer = Buffer.from(JSON.stringify(comparisonResult, null, 2), "utf-8");
  await deps.s3.putObject(s3ResultsKey, resultsBuffer, {
    "x-amz-meta-job-id": jobId,
    "x-amz-meta-attempt": String(attempt),
  });

  // 5. Exactly-Once Finalization Transaction in DynamoDB
  const completedAt = new Date().toISOString();
  await deps.db.transactWrite([
    {
      type: "Update",
      PK: `JOB#${jobId}`,
      SK: "METADATA",
      condition: (item) =>
        Boolean(
          item &&
            item.slotReleased === false &&
            item.attempt === attempt &&
            (item.status === "PENDING" || item.status === "RUNNING"),
        ),
      update: (item) => {
        item.status = "COMPLETED";
        item.slotReleased = true;
        item.s3ResultsKey = s3ResultsKey;
        item.completedAt = completedAt;
        item.resultsPayload = comparisonResult;
        delete item.GSI3PK;
        delete item.GSI3SK;
      },
    },
    {
      type: "Update",
      PK: `INV#${jobItem.invitationId}`,
      SK: "METADATA",
      condition: (item) => Boolean(item && (item.activeJobsCount ?? 0) > 0),
      update: (item) => {
        item.activeJobsCount = Math.max(0, (item.activeJobsCount ?? 1) - 1);
      },
    },
  ]);

  return {
    ok: true,
    jobId,
    comparisonResult,
    s3ResultsKey,
    alreadyFinalized: false,
  };
}
