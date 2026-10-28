import { useEffect, useState } from "react";
import type { CureGame } from "../domain/cureGame";
import type { GraphDifficulty } from "../domain/difficultyGraph";
import type { SimulationPlan } from "../domain/multiSimulation";
import type { StrategyAdvice } from "../domain/strategyAdvisor";
import "./StrategyReport.css";

const names: Record<SimulationPlan, string> = {
  PLAYER: "Tu plan jugado",
  SMART_CORTAFUEGOS: "Cortafuegos automático",
  RANDOM: "Intervención al azar",
  NO_INTERVENTION: "Sin intervención",
};
const adviceFor: Record<SimulationPlan, string> = {
  PLAYER: "Conserva las decisiones registradas y revisa la dispersión antes de cambiar el plan.",
  SMART_CORTAFUEGOS: "Prioriza focos activos, corredores y vacunación en zonas amenazadas, según el presupuesto disponible.",
  RANDOM: "Compara la asignación al azar con el cortafuegos antes de comprometer recursos.",
  NO_INTERVENTION: "Sin intervención es una línea base, no una recomendación sanitaria real.",
};

export function StrategyReport({ game, plan, seed, days, difficulty = "normal" }: { game: CureGame; plan: SimulationPlan; seed: number; days: number; difficulty?: GraphDifficulty }) {
  const [advice, setAdvice] = useState<StrategyAdvice | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/strategyAdvisor.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ advice?: StrategyAdvice; error?: string }>) => {
        if (event.data.advice) setAdvice(event.data.advice);
        else setError(event.data.error || "No se pudo generar el consejo.");
      };
      worker.onerror = () => setError("No se pudo generar el consejo en este navegador.");
      worker.postMessage({ params: { ...game.params, seed, days }, plan, actions: game.actions, difficulty });
    } catch { setError("Este navegador no permite ejecutar el análisis local."); return; }
    return () => worker.terminate();
  }, [game, plan, seed, days, difficulty]);

  const selected = advice?.confirmed ? advice.candidate : plan;
  return <section className="strategy-report" aria-label="Informe y asesor de estrategia">
    <h3>Informe de estrategia</h3>
    <p>Plan analizado: <strong>{names[plan]}</strong> · {days} días · semilla {seed}.</p>
    {plan === "PLAYER" && <p>Decisiones registradas: {Object.values(game.actions).reduce((sum, action) => sum + action.cordonedNodes.length + action.fumigatedNodes.length + Object.keys(action.vaccinatedNodes).length + (action.preventionNodes?.length ?? 0) + (action.isolatedNodes?.length ?? 0), 0)} intervenciones por zona.</p>}
    <p role="status">{error || (!advice ? "El asesor está aprendiendo de simulaciones locales…" : advice.confirmed ? `Sugerencia provisional: ${names[advice.candidate]}.` : "No se confirmó una mejora frente al plan analizado.")}</p>
    {advice && <>
      <p>En {advice.validationRuns} corridas de validación no usadas para aprender: candidato {advice.candidateMean.toLocaleString("es-EC")} contagios promedio; plan analizado {advice.baselineMean.toLocaleString("es-EC")}.</p>
      <p><strong>Consejo:</strong> {adviceFor[selected]}</p>
      <small>Aprendizaje por refuerzo sencillo: un bandido compara estrategias con {advice.trainingRuns} simulaciones, buscando menos contagios. Son pocas muestras de un modelo ficticio; no garantiza una estrategia óptima ni evalúa el progreso de la cura. Las políticas automáticas pueden dedicar todo el presupuesto a contención, sin financiar investigación.</small>
    </>}
  </section>;
}
