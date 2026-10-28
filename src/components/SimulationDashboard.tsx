import { useEffect, useRef, useState } from "react";
import type { CureGame } from "../domain/cureGame";
import { computePercentile } from "../domain/monteCarlo";
import type { SimulationPlan, SimulationSample } from "../domain/multiSimulation";
import { createDifficultyGraph, type GraphDifficulty } from "../domain/difficultyGraph";
import "./SimulationDashboard.css";
import { StrategyReport } from "./StrategyReport";

const format = (n: number) => Math.round(n).toLocaleString("es-EC");

export function SimulationDashboard({ game, onBack }: { game: CureGame; onBack: () => void }) {
  const [plan, setPlan] = useState<SimulationPlan>("SMART_CORTAFUEGOS");
  const [difficulty, setDifficulty] = useState<GraphDifficulty>("normal");
  const [count, setCount] = useState(20);
  const [seedMode, setSeedMode] = useState<"fixed" | "random">("fixed");
  const [seed, setSeed] = useState(game.config.seed);
  const [actualSeed, setActualSeed] = useState<number | null>(null);
  const [actualPlan, setActualPlan] = useState<SimulationPlan>(plan);
  const [actualDifficulty, setActualDifficulty] = useState<GraphDifficulty>(difficulty);
  const [samples, setSamples] = useState<SimulationSample[]>([]);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const workers = useRef<Worker[]>([]);
  const generation = useRef(0);

  const stop = () => {
    generation.current++;
    workers.current.forEach((worker) => worker.terminate());
    workers.current = [];
  };
  useEffect(() => () => stop(), []);

  const start = () => {
    if (!Number.isInteger(count) || count < 1 || count > 200 || (seedMode === "fixed" && (!Number.isInteger(seed) || seed < 0 || seed > 4294967295))) {
      setError("Ingresa entre 1 y 200 simulaciones y una semilla entera válida (0 a 4294967295).");
      return;
    }
    if (typeof Worker === "undefined" || (seedMode === "random" && !globalThis.crypto?.getRandomValues)) {
      setError("Este navegador no admite los recursos necesarios para ejecutar la simulación paralela.");
      return;
    }
    stop();
    const current = generation.current;
    const chosenSeed = seedMode === "random" ? crypto.getRandomValues(new Uint32Array(1))[0] : seed;
    const params = { ...game.params, seed: chosenSeed, days: plan === "PLAYER" ? game.day : game.params.days };
    setActualSeed(chosenSeed); setActualPlan(plan); setActualDifficulty(difficulty); setTotal(count); setSamples([]); setError(""); setRunning(true);
    let next = 0;
    let completed = 0;
    const results: SimulationSample[] = [];
    const fail = (message: string) => { if (current !== generation.current) return; stop(); setRunning(false); setError(message); };
    try {
      const poolSize = Math.min(count, 4, Math.max(1, navigator.hardwareConcurrency || 2));
      const dispatch = (worker: Worker) => {
        if (next < count) worker.postMessage({ params, plan, index: next++, actions: game.actions, difficulty });
      };
      for (let i = 0; i < poolSize; i++) {
        const worker = new Worker(new URL("../workers/multiSimulation.worker.ts", import.meta.url), { type: "module" });
        workers.current.push(worker);
        worker.onerror = () => fail("No se pudo ejecutar la simulación. Vuelve a intentarlo.");
        worker.onmessage = (event: MessageEvent<{ sample?: SimulationSample; error?: string }>) => {
          if (current !== generation.current) return;
          if (!event.data.sample) { fail(event.data.error || "No se pudo completar una simulación."); return; }
          results.push(event.data.sample);
          setSamples([...results]);
          completed++;
          if (completed === count) { stop(); setRunning(false); }
          else dispatch(worker);
        };
        dispatch(worker);
      }
    } catch { fail("No se pudieron iniciar los procesos paralelos del navegador."); }
  };

  const finished = total > 0 && samples.length === total && !error && !running;
  const totals = samples.map((sample) => sample.infected).sort((a, b) => a - b);
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const daily = finished ? samples[0].daily.map((_, day) => average(samples.map((sample) => sample.daily[day]))) : [];
  const chartMax = Math.max(1, ...daily);
  const points = daily.map((value, index) => `${daily.length === 1 ? 0 : (index / (daily.length - 1)) * 100},${100 - value / chartMax * 90}`).join(" ");

  return <main className="simulation-dashboard">
    <div className="simulation-dashboard__inner">
      <header><div><span className="eyebrow">OPERACIÓN ZERO DAY · ANÁLISIS LOCAL</span><h1>Simulación múltiple</h1><p>Compara posibles desenlaces de un plan sin cargar el mapa.</p></div><button className="secondary-button" onClick={onBack}>Volver al mapa</button></header>
      <section className="simulation-settings" aria-label="Configuración de la simulación">
        <label>Plan<select value={plan} disabled={running} onChange={(event) => { const selected = event.target.value as SimulationPlan; setPlan(selected); if (selected === "PLAYER") setDifficulty("normal"); }}><option value="SMART_CORTAFUEGOS">Cortafuegos automático</option><option value="RANDOM">Intervención al azar</option><option value="NO_INTERVENTION">Sin intervención</option><option value="PLAYER" disabled={game.day === 0}>Mi plan jugado hasta el día {game.day}</option></select></label>
        <label>Dificultad y sectores<select value={difficulty} disabled={running || plan === "PLAYER"} onChange={(event) => setDifficulty(event.target.value as GraphDifficulty)}><option value="normal">Normal · 16 zonas</option><option value="hard">Difícil · 32 sectores</option><option value="extreme">Extremo · 48 sectores</option></select></label>
        <label>Simulaciones (1–200)<input type="number" min="1" max="200" step="1" value={count} disabled={running} onChange={(event) => setCount(Number(event.target.value))} /></label>
        <label>Semilla<select value={seedMode} disabled={running} onChange={(event) => setSeedMode(event.target.value as "fixed" | "random")}><option value="fixed">Específica</option><option value="random">Aleatoria</option></select></label>
        {seedMode === "fixed" && <label>Valor de semilla<input type="number" min="0" max="4294967295" step="1" value={seed} disabled={running} onChange={(event) => setSeed(Number(event.target.value))} /></label>}
        <button className="primary-button" disabled={running} onClick={start}>Ejecutar simulaciones</button>
        {running && <button className="secondary-button" onClick={() => { stop(); setRunning(false); setError("Simulación cancelada."); }}>Cancelar</button>}
      </section>
      <p className="simulation-note">Las corridas usan una semilla base y un índice distinto. Mismo plan, semilla y configuración producen los mismos resultados. Máximo cuatro procesos paralelos; no se envían datos al servidor. En difícil y extremo, los sectores son subdivisiones sintéticas: conservan la población, pero sus conexiones son estimadas y no están calibradas.</p>
      <p role="status" className="simulation-status">{error || (running ? `Simulando ${samples.length} de ${total}…` : finished ? `Completadas ${total} simulaciones · semilla ${actualSeed}` : "Configura tu análisis para comenzar.")}</p>
      {running && <progress max={total} value={samples.length} aria-label="Progreso de simulación" />}
      {finished && <section aria-label="Resultados de la simulación" className="simulation-results">
        <p className="simulation-note">Plan ejecutado: {actualPlan === "PLAYER" ? "plan jugado" : actualPlan === "RANDOM" ? "intervención al azar" : actualPlan === "NO_INTERVENTION" ? "sin intervención" : "cortafuegos automático"} · {actualDifficulty === "normal" ? "16 zonas" : actualDifficulty === "hard" ? "32 sectores sintéticos" : "48 sectores sintéticos"}</p>
        <div className="simulation-metrics"><div><span>Contagios acumulados · promedio</span><strong>{format(average(totals))}</strong></div><div><span>Rango P10–P90</span><strong>{format(computePercentile(totals, 10))} – {format(computePercentile(totals, 90))}</strong></div><div><span>Pico infeccioso · promedio</span><strong>{format(average(samples.map((s) => s.peak)))}</strong></div><div><span>Gasto total · promedio</span><strong>${format(average(samples.map((s) => s.spent)))}</strong></div></div>
        <div className="simulation-chart"><h2>Contagios acumulados</h2><p>Promedio por día · {daily.length - 1} días · semilla {actualSeed}</p><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Curva promedio: de ${format(daily[0])} a ${format(daily[daily.length - 1])} contagios`}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" /></svg><div><span>Día 0</span><span>Día {daily.length - 1}</span></div></div>
        <details className="simulation-chart"><summary>Ver sectores simulados</summary><ul>{createDifficultyGraph(actualDifficulty).nodes.map((node) => <li key={node.id}>{node.id} · {node.name} · {format(node.population)} habitantes estimados</li>)}</ul></details>
        <StrategyReport game={game} plan={actualPlan} seed={actualSeed!} days={actualPlan === "PLAYER" ? game.day : game.params.days} difficulty={actualDifficulty} />
        <p className="simulation-note">P10–P90 describe la dispersión entre corridas, no un intervalo de confianza. La semilla aleatoria mostrada permite repetir el análisis.</p>
      </section>}
    </div>
  </main>;
}
