import { learnStrategy } from "../domain/strategyAdvisor";
import { simulateSample, type SimulationPlan } from "../domain/multiSimulation";
import type { GraphDifficulty } from "../domain/difficultyGraph";
import type { DailyAction, SimulationParams } from "../domain/types";

self.onmessage = (event: MessageEvent<{ params: SimulationParams; plan: SimulationPlan; actions: Record<number, DailyAction>; difficulty: GraphDifficulty }>) => {
  try {
    const { params, plan, actions, difficulty } = event.data;
    self.postMessage({ advice: learnStrategy(plan, params.seed, (candidate, index) => simulateSample(params, candidate, index, actions, difficulty).infected) });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "No se pudo analizar la estrategia." }); }
};
