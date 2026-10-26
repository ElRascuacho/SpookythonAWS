import { DEFAULT_SIMULATION_PARAMS, TOTAL_MANTA_POPULATION } from './mantaGraph';
import { runSingleSeirSimulation } from './seirEngine';
import {
  DailyBandPoint,
  MonteCarloComparisonResult,
  SimulationParams,
  SingleSimulationRunResult,
  StrategyMonteCarloSummary,
  StrategyType,
} from './types';

const STRATEGY_LABELS: Record<StrategyType, string> = {
  NO_INTERVENTION: 'Línea Base 1: Sin Intervención',
  RANDOM: 'Línea Base 2: Intervención al Azar',
  SMART_CORTAFUEGOS: 'Nuestra Estrategia: Smart Graph Cortafuegos',
};

export function computePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedValues[lower];
  const weight = idx - lower;
  return Math.round(sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight);
}

function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum / values.length;
}

function computeStdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const diff = values[i] - mean;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / values.length);
}

/**
 * Executes M Monte Carlo simulations for all 3 required strategies:
 * 1. NO_INTERVENTION
 * 2. RANDOM
 * 3. SMART_CORTAFUEGOS
 * Returns daily [P10, Mean, P90] bands, comparative lives saved, and a representative trajectory for 3D playback.
 */
export function runMonteCarloComparison(
  customParams?: Partial<SimulationParams>,
): MonteCarloComparisonResult {
  const startTime = performance.now();
  const params: SimulationParams = {
    ...DEFAULT_SIMULATION_PARAMS,
    ...customParams,
    patientZeroIds:
      customParams?.patientZeroIds && customParams.patientZeroIds.length > 0
        ? [...customParams.patientZeroIds]
        : [...DEFAULT_SIMULATION_PARAMS.patientZeroIds],
  };

  const runsCount = Math.max(1, Math.min(500, Math.floor(params.monteCarloRuns)));
  const strategiesOrder: StrategyType[] = ['NO_INTERVENTION', 'RANDOM', 'SMART_CORTAFUEGOS'];

  const rawRunsByStrategy: Record<StrategyType, SingleSimulationRunResult[]> = {
    NO_INTERVENTION: [],
    RANDOM: [],
    SMART_CORTAFUEGOS: [],
  };

  for (const strategy of strategiesOrder) {
    const runs: SingleSimulationRunResult[] = [];
    for (let r = 0; r < runsCount; r++) {
      runs.push(runSingleSeirSimulation(params, strategy, r));
    }
    rawRunsByStrategy[strategy] = runs;
  }

  const baselineRuns = rawRunsByStrategy.NO_INTERVENTION;

  const summaries = {} as Record<StrategyType, StrategyMonteCarloSummary>;

  for (const strategy of strategiesOrder) {
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
        activeI.push(snap.totalI);
        activeE.push(snap.totalE);
        activeS.push(snap.totalS);
        activeR.push(snap.totalR);
        cumInf.push(snap.cumulativeInfected);
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
      Math.max(0, baselineRuns[idx].totalCumulativeInfected - r.totalCumulativeInfected),
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
      strategy,
      label: STRATEGY_LABELS[strategy],
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

  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    params,
    computedAtIso: new Date().toISOString(),
    executionTimeMs,
    totalPopulation: TOTAL_MANTA_POPULATION,
    strategies: summaries,
  };
}
