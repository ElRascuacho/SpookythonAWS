import { runSingleSeirSimulation } from "./seirEngine";
import {
  type Measure,
  type MeasureEvaluation,
  resolveResearchEffects,
} from "./research";
import { DEFAULT_SIMULATION_PARAMS } from "./mantaGraph";
import type { SimulationParams, StrategyType } from "./types";

/**
 * Pre-evaluates the epidemiological and fiscal impact of an experimental measure
 * against the deterministically configured SEIR baseline in <10ms.
 */
export function evaluateMeasureImpact(
  measure: Measure,
  params: SimulationParams = DEFAULT_SIMULATION_PARAMS,
  strategy: StrategyType = "SMART_CORTAFUEGOS",
): MeasureEvaluation {
  const baseline = runSingleSeirSimulation(params, strategy, 0);
  const withMeasure = runSingleSeirSimulation(
    params,
    strategy,
    0,
    undefined,
    undefined,
    {
      resolveDailyEffects: (day, state, budget) =>
        resolveResearchEffects(day, state, budget, [
          { id: "eval-probe", definition: measure },
        ]),
    },
  );

  const infectionsAvoided = Math.max(
    0,
    baseline.totalCumulativeInfected - withMeasure.totalCumulativeInfected,
  );
  const peakReductionPercent =
    baseline.peakZombies > 0
      ? Number(
          Math.max(
            0,
            ((baseline.peakZombies - withMeasure.peakZombies) / baseline.peakZombies) * 100,
          ).toFixed(1),
        )
      : 0;

  const estimatedCostUsd = Math.round(
    Math.max(0, withMeasure.totalBudgetSpent - baseline.totalBudgetSpent),
  );
  const totalBudget = params.dailyBudget * params.days;
  const budgetViable = withMeasure.totalBudgetSpent <= totalBudget;
  const hospitalRelieved =
    baseline.hospitalCollapseDays > 0 && withMeasure.hospitalCollapseDays === 0;

  return {
    infectionsAvoided,
    peakReductionPercent,
    estimatedCostUsd,
    budgetViable,
    hospitalRelieved,
    baselinePeakInfected: baseline.peakZombies,
    simulatedPeakInfected: withMeasure.peakZombies,
  };
}
