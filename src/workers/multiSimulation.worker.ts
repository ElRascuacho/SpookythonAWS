import { simulateSample, type SimulationPlan } from "../domain/multiSimulation";
import type { DailyAction, SimulationParams } from "../domain/types";
import { simulatePolicyPair } from "../domain/policyEvaluation";
import type { PolicyWeights } from "../domain/committee/types";
import type { GraphDifficulty } from "../domain/difficultyGraph";

self.onmessage = (event: MessageEvent<{ params: SimulationParams; plan: SimulationPlan | "COMMITTEE"; weights?: PolicyWeights; index: number; actions: Record<number, DailyAction>; difficulty: GraphDifficulty }>) => {
  try {
    const { params, plan, index, actions, difficulty, weights } = event.data;
    if (plan === "COMMITTEE") {
      if (difficulty !== "normal" || !weights) throw new Error("La política requiere las 16 zonas originales.");
      self.postMessage({ pair: simulatePolicyPair(params, weights, index) });
    } else self.postMessage({ sample: simulateSample(params, plan, index, actions, difficulty) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Error en la simulación" });
  }
};
