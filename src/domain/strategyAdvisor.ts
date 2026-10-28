import { createSeededRng } from "./prng";
import type { SimulationPlan } from "./multiSimulation";

export interface StrategyAdvice {
  candidate: SimulationPlan;
  baseline: SimulationPlan;
  candidateMean: number;
  baselineMean: number;
  trainingRuns: number;
  validationRuns: number;
  confirmed: boolean;
}

// An epsilon-greedy bandit learns from simulations, then uses unseen runs to check its choice.
export function learnStrategy(baseline: SimulationPlan, seed: number, evaluate: (plan: SimulationPlan, runIndex: number) => number): StrategyAdvice {
  const plans: SimulationPlan[] = ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"];
  if (baseline === "PLAYER") plans.push("PLAYER");
  const rng = createSeededRng(seed, "STRATEGY_ADVISOR", 0);
  const totals = plans.map(() => 0), counts = plans.map(() => 0);
  const trainingRuns = 20, validationRuns = 3;
  for (let run = 0; run < trainingRuns; run++) {
    const choice = run < plans.length ? run : rng() < 0.2 ? Math.floor(rng() * plans.length) : counts.reduce((best, n, i) => totals[i] / n < totals[best] / counts[best] ? i : best, 0);
    totals[choice] += evaluate(plans[choice], 1000 + run);
    counts[choice]++;
  }
  const best = counts.reduce((winner, n, i) => totals[i] / n < totals[winner] / counts[winner] ? i : winner, 0);
  const candidate = plans[best];
  let candidateSum = 0, baselineSum = 0;
  for (let run = 0; run < validationRuns; run++) {
    const index = 2000 + run;
    const result = evaluate(candidate, index);
    candidateSum += result;
    baselineSum += candidate === baseline ? result : evaluate(baseline, index);
  }
  const candidateMean = Math.round(candidateSum / validationRuns);
  const baselineMean = Math.round(baselineSum / validationRuns);
  return { candidate, baseline, candidateMean, baselineMean, trainingRuns, validationRuns, confirmed: candidate !== baseline && candidateMean < baselineMean };
}
