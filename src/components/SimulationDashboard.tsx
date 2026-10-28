import { useEffect, useRef, useState } from "react";
import type { CureGame } from "../domain/cureGame";
import type { SimulationPlan, SimulationSample } from "../domain/multiSimulation";
import { createDifficultyGraph, type GraphDifficulty } from "../domain/difficultyGraph";
import "./SimulationDashboard.css";
import { parsePublishedPolicy, summarizePolicyPairs, type PolicyPair, type PublishedPolicy } from "../domain/policyEvaluation";
import { dailyCumulativeBand, distribution, pairsToCsv, samplesToCsv, type DailyBand } from "../domain/simulationAudit";
import { StrategyReport } from "./StrategyReport";

const format = (n: number) => Math.round(n).toLocaleString("es-EC");

function downloadCsv(filename: string, text: string) {
  const blob = new Blob([`\uFEFF${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function chartX(index: number, count: number) {
  return count <= 1 ? 0 : (index / (count - 1)) * 100;
}

function chartY(value: number, max: number) {
  return 100 - (value / Math.max(max, 1)) * 90;
}

function linePoints(values: number[], max: number) {
  return values.map((value, index) => `${chartX(index, values.length)},${chartY(value, max)}`).join(" ");
}

function bandPolygon(band: DailyBand[], max: number) {
  const top = band.map((point, index) => `${chartX(index, band.length)},${chartY(point.p90, max)}`);
  const bottom = [...band].map((point, index) => `${chartX(index, band.length)},${chartY(point.p10, max)}`).reverse();
  return [...top, ...bottom].join(" ");
}

function CumulativeChart({ title, caption, band, selected, comparison, label }: { title: string; caption: string; band: DailyBand[]; selected: number[] | null; comparison?: number[] | null; label: string }) {
  if (!band.length) return null;
  const max = Math.max(1, ...band.flatMap((point) => [point.p90, point.mean]), ...(selected ?? []), ...(comparison ?? []));
  const mean = band.map((point) => point.mean);
  return (
    <div className="simulation-chart">
      <h2>{title}</h2>
      <p>{caption}</p>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label}>
        <polygon className="band" points={bandPolygon(band, max)} />
        {selected ? <polyline className="selected" points={linePoints(selected, max)} fill="none" strokeWidth="1.8" vectorEffect="non-scaling-stroke" /> : <polyline className="mean" points={linePoints(mean, max)} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />}
        {comparison && <polyline className="comparison" points={linePoints(comparison, max)} fill="none" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div><span>Día 0</span><span>Día {Math.max(0, band.length - 1)}</span></div>
    </div>
  );
}

function SortHeader({ label, column, sort, onSort }: { label: string; column: string; sort: { key: string; dir: 1 | -1 }; onSort: (column: string) => void }) {
  const active = sort.key === column;
  return (
    <th aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(column)}>{label}{active ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button>
    </th>
  );
}

export function SimulationDashboard({ game, onBack }: { game: CureGame; onBack: () => void }) {
  const [plan, setPlan] = useState<SimulationPlan | "COMMITTEE">("SMART_CORTAFUEGOS");
  const [difficulty, setDifficulty] = useState<GraphDifficulty>("normal");
  const [count, setCount] = useState(20);
  const [seedMode, setSeedMode] = useState<"fixed" | "random">("fixed");
  const [seed, setSeed] = useState(game.config.seed);
  const [actualSeed, setActualSeed] = useState<number | null>(null);
  const [actualPlan, setActualPlan] = useState<SimulationPlan | "COMMITTEE">(plan);
  const [actualDifficulty, setActualDifficulty] = useState<GraphDifficulty>(difficulty);
  const [samples, setSamples] = useState<SimulationSample[]>([]);
  const [pairs, setPairs] = useState<PolicyPair[]>([]);
  const [policy, setPolicy] = useState<PublishedPolicy | null>(null);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "index", dir: 1 });
  const workers = useRef<Worker[]>([]);
  const generation = useRef(0);

  const stop = () => {
    generation.current++;
    workers.current.forEach((worker) => worker.terminate());
    workers.current = [];
  };
  useEffect(() => () => stop(), []);

  const start = async () => {
    if (!Number.isInteger(count) || count < (plan === "COMMITTEE" ? 2 : 1) || count > 200 || (seedMode === "fixed" && (!Number.isInteger(seed) || seed < 0 || seed > 4294967295))) {
      setError("Ingresa entre 1 y 200 simulaciones (al menos 2 para el Comité) y una semilla entera válida (0 a 4294967295).");
      return;
    }
    if (typeof Worker === "undefined" || (seedMode === "random" && !globalThis.crypto?.getRandomValues)) {
      setError("Este navegador no admite los recursos necesarios para ejecutar la simulación paralela.");
      return;
    }
    stop();
    const current = generation.current;
    const chosenSeed = seedMode === "random" ? crypto.getRandomValues(new Uint32Array(1))[0] : seed;
    setActualSeed(chosenSeed); setActualPlan(plan); setActualDifficulty(difficulty); setTotal(count); setSamples([]); setPairs([]); setPolicy(null); setSelectedIndex(null); setError(""); setRunning(true);
    let selectedPolicy: PublishedPolicy | null = null;
    if (plan === "COMMITTEE") {
      try {
        const response = await fetch("/api/committee/policies/latest", { credentials: "same-origin" });
        if (!response.ok) throw new Error(response.status === 404 ? "No hay una política publicada del Comité." : "No se pudo obtener la política publicada del Comité.");
        selectedPolicy = parsePublishedPolicy(await response.json());
      } catch (cause) {
        if (current === generation.current) { setError(cause instanceof Error ? cause.message : "No se pudo obtener la política."); setRunning(false); }
        return;
      }
      if (current !== generation.current) return;
      setPolicy(selectedPolicy);
    }
    const params = selectedPolicy ? { ...selectedPolicy.artifact.params, seed: chosenSeed } : { ...game.params, seed: chosenSeed, days: plan === "PLAYER" ? game.day : game.params.days };
    let next = 0;
    let completed = 0;
    const results: SimulationSample[] = [];
    const pairedResults: PolicyPair[] = [];
    const fail = (message: string) => { if (current !== generation.current) return; stop(); setRunning(false); setError(message); };
    try {
      const poolSize = Math.min(count, 4, Math.max(1, navigator.hardwareConcurrency || 2));
      const dispatch = (worker: Worker) => {
        if (next < count) worker.postMessage({ params, plan, index: (selectedPolicy ? Math.max(...selectedPolicy.artifact.manifest.pools.final.runIndices) + 1 : 0) + next++, actions: game.actions, difficulty, weights: selectedPolicy?.artifact.weights });
      };
      for (let i = 0; i < poolSize; i++) {
        const worker = new Worker(new URL("../workers/multiSimulation.worker.ts", import.meta.url), { type: "module" });
        workers.current.push(worker);
        worker.onerror = () => fail("No se pudo ejecutar la simulación. Vuelve a intentarlo.");
        worker.onmessage = (event: MessageEvent<{ sample?: SimulationSample; pair?: PolicyPair; error?: string }>) => {
          if (current !== generation.current) return;
          if (!event.data.sample && !event.data.pair) { fail(event.data.error || "No se pudo completar una simulación."); return; }
          if (event.data.pair) { pairedResults.push(event.data.pair); setPairs([...pairedResults]); }
          if (event.data.sample) { results.push(event.data.sample); setSamples([...results]); }
          completed++;
          if (completed === count) { stop(); setRunning(false); }
          else dispatch(worker);
        };
        dispatch(worker);
      }
    } catch { fail("No se pudieron iniciar los procesos paralelos del navegador."); }
  };

  const completedCount = actualPlan === "COMMITTEE" ? pairs.length : samples.length;
  const finished = total > 0 && completedCount === total && !error && !running;
  const comparison = finished && actualPlan === "COMMITTEE" ? summarizePolicyPairs(pairs, actualSeed!) : null;
  const infected = samples.length ? distribution(samples.map((sample) => sample.infected)) : null;
  const collapseRuns = samples.filter((sample) => sample.hospitalCollapseDays > 0).length;
  const band = samples.length ? dailyCumulativeBand(samples.map((sample) => sample.daily)) : [];
  const selectedSample = samples.find((sample) => sample.index === selectedIndex) ?? null;
  const candidateInfected = pairs.length ? distribution(pairs.map((pair) => pair.candidate.infected)) : null;
  const candidateCollapse = pairs.filter((pair) => pair.candidate.hospitalCollapseDays > 0).length;
  const pairBand = pairs.length ? dailyCumulativeBand(pairs.map((pair) => pair.candidate.daily)) : [];
  const selectedPair = pairs.find((pair) => pair.index === selectedIndex) ?? null;
  const planLabel = actualPlan === "PLAYER" ? "plan jugado" : actualPlan === "RANDOM" ? "intervención al azar" : actualPlan === "NO_INTERVENTION" ? "sin intervención" : actualPlan === "COMMITTEE" ? "política publicada del Comité" : "cortafuegos automático";
  const difficultyLabel = actualDifficulty === "normal" ? "16 zonas" : actualDifficulty === "hard" ? "32 sectores sintéticos" : "48 sectores sintéticos";
  const onSort = (column: string) => setSort((current) => current.key === column ? { key: column, dir: current.dir === 1 ? -1 : 1 } : { key: column, dir: column === "index" ? 1 : -1 });
  const orderedSamples = [...samples].sort((a, b) => ((a[sort.key as keyof SimulationSample] as number) - (b[sort.key as keyof SimulationSample] as number)) * sort.dir);
  const orderedPairs = [...pairs].sort((a, b) => {
    const value = (pair: PolicyPair) => sort.key === "sgc" ? pair.sgc.infected : sort.key === "difference" ? pair.sgc.infected - pair.candidate.infected : sort.key === "peak" ? pair.candidate.peak : sort.key === "peakDay" ? pair.candidate.peakDay : sort.key === "hospitalCollapseDays" ? pair.candidate.hospitalCollapseDays : sort.key === "vaccines" ? pair.candidate.vaccines : sort.key === "candidate" ? pair.candidate.infected : pair.index;
    return (value(a) - value(b)) * sort.dir;
  });

  return <main className="simulation-dashboard">
    <div className="simulation-dashboard__inner">
      <header><div><span className="eyebrow">OPERACIÓN ZERO DAY · ANÁLISIS LOCAL</span><h1>Simulación múltiple</h1><p>Compara posibles desenlaces de un plan sin cargar el mapa.</p></div><button className="secondary-button" onClick={onBack}>Volver al mapa</button></header>
      <section className="simulation-settings" aria-label="Configuración de la simulación">
        <label>Plan<select value={plan} disabled={running} onChange={(event) => { const selected = event.target.value as SimulationPlan | "COMMITTEE"; setPlan(selected); if (selected === "PLAYER" || selected === "COMMITTEE") setDifficulty("normal"); }}><option value="COMMITTEE">Política publicada del Comité</option><option value="SMART_CORTAFUEGOS">Cortafuegos automático</option><option value="RANDOM">Intervención al azar</option><option value="NO_INTERVENTION">Sin intervención</option><option value="PLAYER" disabled={game.day === 0}>Mi plan jugado hasta el día {game.day}</option></select></label>
        <label>Dificultad y sectores<select value={difficulty} disabled={running || plan === "PLAYER" || plan === "COMMITTEE"} onChange={(event) => setDifficulty(event.target.value as GraphDifficulty)}><option value="normal">Normal · 16 zonas</option><option value="hard">Difícil · 32 sectores</option><option value="extreme">Extremo · 48 sectores</option></select></label>
        <label>Simulaciones (1–200)<input type="number" min="1" max="200" step="1" value={count} disabled={running} onChange={(event) => setCount(Number(event.target.value))} /></label>
        <label>Semilla<select value={seedMode} disabled={running} onChange={(event) => setSeedMode(event.target.value as "fixed" | "random")}><option value="fixed">Específica</option><option value="random">Aleatoria</option></select></label>
        {seedMode === "fixed" && <label>Valor de semilla<input type="number" min="0" max="4294967295" step="1" value={seed} disabled={running} onChange={(event) => setSeed(Number(event.target.value))} /></label>}
        <button className="primary-button" disabled={running} onClick={start}>Ejecutar simulaciones</button>
        {running && <button className="secondary-button" onClick={() => { stop(); setRunning(false); setError("Simulación cancelada."); }}>Cancelar</button>}
      </section>
      <p className="simulation-note">Cada corrida combina la semilla base con un índice secuencial para simular variantes probabilísticas distintas del mismo brote (método Monte Carlo). Repetir la misma semilla reproducirá exactamente las mismas variantes. Máximo cuatro procesos paralelos. La política del Comité se consulta al servidor; las corridas permanecen en el navegador. En difícil y extremo, los sectores son subdivisiones sintéticas: conservan la población, pero sus conexiones son estimadas y no están calibradas.</p>
      <p role="status" className="simulation-status">{error || (running ? `Simulando ${completedCount} de ${total}…` : finished ? `Completadas ${total} simulaciones · semilla ${actualSeed}` : "Configura tu análisis para comenzar.")}</p>
      {running && <progress max={total} value={completedCount} aria-label="Progreso de simulación" />}
      {finished && comparison && policy && candidateInfected && <section aria-label="Evaluación de la política del Comité" className="simulation-results">
        <p className="simulation-note">Política {policy.artifact.policyVersion} · registro {policy.registryVersion} · {policy.artifact.recommendation === "sgc-fallback" ? "alternativa SGC (sin mejora aprobada)" : "entrenada y publicada"} · 16 zonas · {policy.artifact.params.days} días · semilla {actualSeed} · {pairs.length} pares ({pairs.length * 2} corridas).</p>
        <div className="simulation-metrics">
          <div><span>Mejora de contagios frente a SGC</span><strong>{comparison.improvementPercent === null ? "No definida" : `${comparison.improvementPercent >= 0 ? "+" : ""}${comparison.improvementPercent.toFixed(2)}%`}</strong></div>
          <div><span>Contagios promedio · política</span><strong>{format(comparison.candidateMean)}</strong></div>
          <div><span>Contagios promedio · SGC</span><strong>{format(comparison.sgcMean)}</strong></div>
          <div><span>Política · mínimo / mediana / máximo</span><strong>{format(candidateInfected.min)} / {format(candidateInfected.median)} / {format(candidateInfected.max)}</strong></div>
          <div><span>Política · rango P10–P90</span><strong>{format(comparison.p10)} – {format(comparison.p90)}</strong></div>
          <div><span>Política · corridas con colapso</span><strong>{candidateCollapse} de {pairs.length}</strong></div>
        </div>
        <p>Diferencia pareada promedio (SGC menos política): {format(comparison.meanDifference)} contagios. Intervalo bootstrap del 95%: {format(comparison.confidenceInterval[0])} a {format(comparison.confidenceInterval[1])} contagios.</p>
        <CumulativeChart title="Contagios de la política" caption={selectedPair ? `Par ${selectedPair.index}: política ${format(selectedPair.candidate.infected)} · SGC ${format(selectedPair.sgc.infected)}` : `Promedio de la política y banda P10–P90 · semilla ${actualSeed}`} band={pairBand} selected={selectedPair?.candidate.daily ?? null} comparison={selectedPair?.sgc.daily ?? null} label={selectedPair ? `Curva del par ${selectedPair.index}. La línea clara es la política y la coral es SGC.` : "Promedio de la política con banda P10–P90."} />
        {selectedPair && <button className="secondary-button" type="button" onClick={() => setSelectedIndex(null)}>Volver al promedio</button>}
        <div className="simulation-toolbar"><p className="simulation-note">Cada fila es un par con la misma semilla y el mismo índice. La diferencia es SGC menos política. El CSV trae ambos lados sin redondear.</p><button className="secondary-button" type="button" onClick={() => downloadCsv(`comite-${actualSeed}.csv`, pairsToCsv({ plan: planLabel, difficulty: "16 zonas", seed: actualSeed!, policyVersion: policy.artifact.policyVersion, registryVersion: policy.registryVersion }, pairs))}>Descargar CSV</button></div>
        <div className="simulation-table-wrap">
          <table className="simulation-table">
            <thead><tr><SortHeader label="Índice" column="index" sort={sort} onSort={onSort} /><SortHeader label="Política" column="candidate" sort={sort} onSort={onSort} /><SortHeader label="SGC" column="sgc" sort={sort} onSort={onSort} /><SortHeader label="Diferencia" column="difference" sort={sort} onSort={onSort} /><SortHeader label="Pico" column="peak" sort={sort} onSort={onSort} /><SortHeader label="Día del pico" column="peakDay" sort={sort} onSort={onSort} /><SortHeader label="Colapso" column="hospitalCollapseDays" sort={sort} onSort={onSort} /><SortHeader label="Vacunas" column="vaccines" sort={sort} onSort={onSort} /><th>Curva</th></tr></thead>
            <tbody>{orderedPairs.map((pair) => <tr key={pair.index} className={pair.index === selectedIndex ? "is-selected" : ""}><td>{pair.index}</td><td>{format(pair.candidate.infected)}</td><td>{format(pair.sgc.infected)}</td><td>{format(pair.sgc.infected - pair.candidate.infected)}</td><td>{format(pair.candidate.peak)}</td><td>{pair.candidate.peakDay}</td><td>{pair.candidate.hospitalCollapseDays}</td><td>{format(pair.candidate.vaccines)}</td><td><button type="button" aria-pressed={pair.index === selectedIndex} onClick={() => setSelectedIndex(pair.index === selectedIndex ? null : pair.index)}>{pair.index === selectedIndex ? "Viendo" : "Ver"}</button></td></tr>)}</tbody>
          </table>
        </div>
        <p className="simulation-note">Un porcentaje negativo indica más contagios que SGC. El rango P10–P90 describe dispersión; el intervalo bootstrap estima incertidumbre de la diferencia. La política se evalúa sin entrenamiento y no se compara con el plan manual.</p>
      </section>}
      {finished && actualPlan !== "COMMITTEE" && infected && <section aria-label="Resultados de la simulación" className="simulation-results">
        <p className="simulation-note">Plan ejecutado: {planLabel} · {difficultyLabel}</p>
        <div className="simulation-metrics">
          <div><span>Contagios acumulados · promedio</span><strong>{format(infected.mean)}</strong></div>
          <div><span>Contagios · mínimo / mediana / máximo</span><strong>{format(infected.min)} / {format(infected.median)} / {format(infected.max)}</strong></div>
          <div><span>Rango P10–P90</span><strong>{format(infected.p10)} – {format(infected.p90)}</strong></div>
          <div><span>Pico infeccioso · promedio</span><strong>{format(distribution(samples.map((sample) => sample.peak)).mean)}</strong></div>
          <div><span>Gasto total · promedio</span><strong>${format(distribution(samples.map((sample) => sample.spent)).mean)}</strong></div>
          <div><span>Corridas con colapso hospitalario</span><strong>{collapseRuns} de {samples.length}</strong></div>
        </div>
        <CumulativeChart title="Contagios acumulados" caption={selectedSample ? `Corrida ${selectedSample.index} · semilla ${selectedSample.seed} · día del pico ${selectedSample.peakDay}` : `Promedio y banda P10–P90 · ${Math.max(0, band.length - 1)} días · semilla ${actualSeed}`} band={band} selected={selectedSample?.daily ?? null} label={selectedSample ? `Curva de la corrida ${selectedSample.index}: de ${format(selectedSample.daily[0] ?? 0)} a ${format(selectedSample.daily.at(-1) ?? 0)} contagios` : `Promedio de ${format(band[0]?.mean ?? 0)} a ${format(band.at(-1)?.mean ?? 0)} contagios, con banda P10–P90`} />
        {selectedSample && <button className="secondary-button" type="button" onClick={() => setSelectedIndex(null)}>Volver al promedio</button>}
        <div className="simulation-toolbar"><p className="simulation-note">Elige una corrida para ver su curva. El CSV trae los valores sin redondear.</p><button className="secondary-button" type="button" onClick={() => downloadCsv(`simulacion-${actualSeed}.csv`, samplesToCsv({ plan: planLabel, difficulty: difficultyLabel, seed: actualSeed! }, samples))}>Descargar CSV</button></div>
        <div className="simulation-table-wrap">
          <table className="simulation-table">
            <thead><tr><SortHeader label="Índice" column="index" sort={sort} onSort={onSort} /><SortHeader label="Semilla" column="seed" sort={sort} onSort={onSort} /><SortHeader label="Contagios" column="infected" sort={sort} onSort={onSort} /><SortHeader label="Pico" column="peak" sort={sort} onSort={onSort} /><SortHeader label="Día del pico" column="peakDay" sort={sort} onSort={onSort} /><SortHeader label="Gasto" column="spent" sort={sort} onSort={onSort} /><SortHeader label="Colapso" column="hospitalCollapseDays" sort={sort} onSort={onSort} /><SortHeader label="Vacunas" column="vaccines" sort={sort} onSort={onSort} /><th>Curva</th></tr></thead>
            <tbody>{orderedSamples.map((sample) => <tr key={sample.index} className={sample.index === selectedIndex ? "is-selected" : ""}><td>{sample.index}</td><td>{sample.seed}</td><td>{format(sample.infected)}</td><td>{format(sample.peak)}</td><td>{sample.peakDay}</td><td>${format(sample.spent)}</td><td>{sample.hospitalCollapseDays}</td><td>{format(sample.vaccines)}</td><td><button type="button" aria-pressed={sample.index === selectedIndex} onClick={() => setSelectedIndex(sample.index === selectedIndex ? null : sample.index)}>{sample.index === selectedIndex ? "Viendo" : "Ver"}</button></td></tr>)}</tbody>
          </table>
        </div>
        <details className="simulation-chart"><summary>Ver sectores simulados</summary><ul>{createDifficultyGraph(actualDifficulty).nodes.map((node) => <li key={node.id}>{node.id} · {node.name} · {format(node.population)} habitantes estimados</li>)}</ul></details>
        <StrategyReport game={game} plan={actualPlan} seed={actualSeed!} days={actualPlan === "PLAYER" ? game.day : game.params.days} difficulty={actualDifficulty} />
        <p className="simulation-note">P10–P90 describe la dispersión entre corridas, no un intervalo de confianza. La semilla y el índice permiten repetir cada corrida.</p>
      </section>}
    </div>
  </main>;
}
