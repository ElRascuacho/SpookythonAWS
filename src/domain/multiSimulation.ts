import { runSingleSeirSimulation } from "./seirEngine";
import { createDifficultyGraph, type GraphDifficulty } from "./difficultyGraph";
import type { DailyAction, SimulationParams, StrategyType } from "./types";

export type SimulationPlan = StrategyType | "PLAYER";
export interface SimulationSample {
  index: number;
  seed: number;
  infected: number;
  peak: number;
  peakDay: number;
  spent: number;
  vaccines: number;
  hospitalCollapseDays: number;
  daily: number[];
}

export function simulateSample(params: SimulationParams, plan: SimulationPlan, index: number, actions: Record<number, DailyAction>, difficulty: GraphDifficulty = "normal"): SimulationSample {
  if (plan === "PLAYER" && difficulty !== "normal") throw new Error("El plan jugado solo está disponible con 16 zonas originales.");
  const graph = difficulty === "normal" ? undefined : createDifficultyGraph(difficulty);
  const expandedParams = graph ? { ...params, patientZeroIds: params.patientZeroIds.map((id) => graph.parentToChildren[id]?.[0] ?? id) } : params;
  const run = runSingleSeirSimulation(expandedParams, plan === "PLAYER" ? "SMART_CORTAFUEGOS" : plan, index, plan === "PLAYER" ? actions : undefined, graph);
  return {
    index,
    seed: params.seed,
    infected: run.totalCumulativeInfected,
    peak: run.peakZombies,
    peakDay: run.peakDay,
    spent: run.totalBudgetSpent,
    vaccines: run.totalVaccinesUsed,
    hospitalCollapseDays: run.hospitalCollapseDays,
    daily: run.timeline.map((day) => day.cumulativeInfected),
  };
}
