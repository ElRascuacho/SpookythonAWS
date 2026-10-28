import { simulateSample, type SimulationPlan } from "../domain/multiSimulation";
import type { DailyAction, SimulationParams } from "../domain/types";
import type { GraphDifficulty } from "../domain/difficultyGraph";

self.onmessage = (event: MessageEvent<{ params: SimulationParams; plan: SimulationPlan; index: number; actions: Record<number, DailyAction>; difficulty: GraphDifficulty }>) => {
  try {
    const { params, plan, index, actions, difficulty } = event.data;
    self.postMessage({ sample: simulateSample(params, plan, index, actions, difficulty) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Error en la simulación" });
  }
};
