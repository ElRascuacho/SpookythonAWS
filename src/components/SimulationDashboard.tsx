import { useEffect, useRef, useState } from "react";
import type { CureGame } from "../domain/cureGame";
import type { SimulationPlan, SimulationSample } from "../domain/multiSimulation";
import { createDifficultyGraph, type GraphDifficulty } from "../domain/difficultyGraph";
import "./SimulationDashboard.css";
import { DEFAULT_PUBLISHED_POLICY, parsePublishedPolicy, summarizePolicyPairs, type PolicyPair, type PublishedPolicy } from "../domain/policyEvaluation";
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
  const lastDay = Math.max(0, band.length - 1);
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    ratio,
    y: chartY(max * ratio, max),
    label: format(max * ratio),
  }));
  const xTickDays = Array.from(new Set([0, Math.round(lastDay * 0.25), Math.round(lastDay * 0.5), Math.round(lastDay * 0.75), lastDay]));

  return (
    <div className="simulation-chart">
      <div className="simulation-chart__header">
        <div>
          <h2>{title}</h2>
          <p>{caption}</p>
        </div>
        <div className="simulation-chart__legend" aria-label="Leyenda del gráfico">
          <span className="legend-item">
            <i className="legend-swatch legend-swatch--band" aria-hidden="true" />
            Banda P10–P90 (80% central)
          </span>
          {selected ? (
            <span className="legend-item">
              <i className="legend-swatch legend-swatch--selected" aria-hidden="true" />
              {comparison ? "Política del Comité (par elegido)" : "Corrida seleccionada"}
            </span>
          ) : (
            <span className="legend-item">
              <i className="legend-swatch legend-swatch--mean" aria-hidden="true" />
              {comparison ? "Promedio Política del Comité" : "Promedio Monte Carlo"}
            </span>
          )}
          {comparison && (
            <span className="legend-item">
              <i className="legend-swatch legend-swatch--comparison" aria-hidden="true" />
              {selected ? "Referencia SGC (par elegido)" : "Promedio SGC (referencia)"}
            </span>
          )}
        </div>
      </div>

      <div className="simulation-chart__plot">
        <div className="simulation-chart__y-title" aria-hidden="true">Contagios acumulados (personas)</div>
        <div className="simulation-chart__y-axis" aria-hidden="true">
          {yTicks.map((tick) => (
            <span key={tick.ratio}>{tick.label}</span>
          ))}
        </div>
        <div className="simulation-chart__canvas">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={label}>
            {yTicks.map((tick) => (
              <line key={tick.ratio} className="grid-line" x1="0" y1={tick.y} x2="100" y2={tick.y} vectorEffect="non-scaling-stroke" />
            ))}
            {xTickDays.map((day) => (
              <line key={day} className="grid-line" x1={chartX(day, band.length)} y1="10" x2={chartX(day, band.length)} y2="100" vectorEffect="non-scaling-stroke" />
            ))}
            <polygon className="band" points={bandPolygon(band, max)} />
            {selected ? <polyline className="selected" points={linePoints(selected, max)} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : <polyline className="mean" points={linePoints(mean, max)} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />}
            {comparison && <polyline className="comparison" points={linePoints(comparison, max)} fill="none" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />}
          </svg>
          <div className="simulation-chart__x-axis">
            {xTickDays.map((day) => (
              <span key={day}>Día {day}</span>
            ))}
          </div>
          <div className="simulation-chart__x-title">Eje X: Tiempo transcurrido (días) · Eje Y: Personas infectadas acumuladas</div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="simulation-metric-card">
      <div className="simulation-metric-card__head">
        <span>{label}</span>
        <button type="button" className="metric-info-btn" aria-label={`Información sobre ${label}: ${help}`}>
          <span aria-hidden="true">ⓘ</span>
          <span className="metric-tooltip" role="tooltip">{help}</span>
        </button>
      </div>
      <strong>{value}</strong>
    </div>
  );
}

const SAMPLE_CSV_DICTIONARY: Array<{ col: string; unit: string; desc: string }> = [
  { col: "plan", unit: "Texto", desc: "Estrategia epidemiológica evaluada (Cortafuegos automático, Azar, Sin intervención o Plan jugado)." },
  { col: "dificultad", unit: "Texto", desc: "Escala topológica de la ciudad (16 zonas originales, 32 o 48 sectores sintéticos)." },
  { col: "semilla", unit: "Entero (32-bit)", desc: "Semilla base del generador pseudoaleatorio (PRNG) que garantiza reproducibilidad exacta." },
  { col: "indice", unit: "Entero", desc: "Número secuencial de la variante estocástica dentro del experimento Monte Carlo." },
  { col: "contagios", unit: "Personas", desc: "Total acumulado de habitantes que se infectaron desde el Día 0 hasta el cierre del horizonte." },
  { col: "pico", unit: "Personas", desc: "Máximo histórico de infectados activos simultáneos (I) en un solo día; mide el estrés hospitalario." },
  { col: "dia_pico", unit: "Día (0–H)", desc: "Día exacto en el que ocurrió el pico máximo de infección activa." },
  { col: "gasto", unit: "USD ($)", desc: "Presupuesto municipal total ejecutado en vacunas, fumigación y cordones durante toda la corrida." },
  { col: "vacunas", unit: "Dosis", desc: "Total de dosis de vacunas aplicadas estrictamente sobre población susceptible (S)." },
  { col: "dias_colapso_hospital", unit: "Días", desc: "Cantidad de días en los que los infectados activos superaron la capacidad del Hospital Rodríguez Zambrano." },
];

const COMMITTEE_CSV_DICTIONARY: Array<{ col: string; unit: string; desc: string }> = [
  { col: "plan", unit: "Texto", desc: "Identificador del modo de evaluación ('política publicada del Comité')." },
  { col: "dificultad", unit: "Texto", desc: "Topología evaluada ('16 zonas' urbanas de Manta)." },
  { col: "semilla", unit: "Entero (32-bit)", desc: "Semilla base compartida por ambos lados del par para comparación justa." },
  { col: "politica", unit: "Entero", desc: "Versión numérica de la política aprendida por el Comité." },
  { col: "registro", unit: "Texto (ID)", desc: "Identificador inmutable de publicación en el registro del Comité." },
  { col: "indice", unit: "Entero", desc: "Índice de réplica del par evaluado (fuera de los índices usados en entrenamiento)." },
  { col: "contagios_politica", unit: "Personas", desc: "Contagios acumulados totales al cierre usando la política del Comité." },
  { col: "contagios_sgc", unit: "Personas", desc: "Contagios acumulados totales al cierre usando la heurística base Smart Graph Cortafuegos (SGC)." },
  { col: "diferencia_sgc_menos_politica", unit: "Personas", desc: "Casos evitados frente a SGC (contagios_sgc − contagios_politica). Un valor positivo indica que la política superó a SGC." },
  { col: "pico_politica / pico_sgc", unit: "Personas", desc: "Máximo de infectados activos simultáneos bajo la política del Comité y bajo SGC, respectivamente." },
  { col: "dia_pico_politica / dia_pico_sgc", unit: "Día (0–H)", desc: "Día en que se alcanzó el pico infeccioso en cada estrategia del par." },
  { col: "gasto_politica / gasto_sgc", unit: "USD ($)", desc: "Presupuesto acumulado invertido por la política del Comité y por SGC." },
  { col: "vacunas_politica / vacunas_sgc", unit: "Dosis", desc: "Dosis de vacunas administradas a susceptibles en cada estrategia." },
  { col: "dias_colapso_politica / dias_colapso_sgc", unit: "Días", desc: "Días con saturación hospitalaria bajo la política del Comité y bajo SGC." },
];

function DatasetDictionary({ mode }: { mode: "committee" | "standard" }) {
  const rows = mode === "committee" ? COMMITTEE_CSV_DICTIONARY : SAMPLE_CSV_DICTIONARY;
  return (
    <details className="simulation-chart simulation-dictionary">
      <summary>📖 Diccionario de datos del CSV descargable ({rows.length} campos documentados)</summary>
      <p className="simulation-note">
        Estructura de columnas incluidas al descargar el archivo <code>.csv</code> (codificado en UTF-8 con valores numéricos exactos sin redondear):
      </p>
      <div className="simulation-table-wrap">
        <table className="simulation-table simulation-dictionary__table">
          <thead>
            <tr>
              <th>Columna en CSV</th>
              <th>Unidad / Tipo</th>
              <th>Significado epidemiológico</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.col}>
                <td><code>{item.col}</code></td>
                <td>{item.unit}</td>
                <td>{item.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
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
    if (!Number.isInteger(count) || count < (plan === "COMMITTEE" ? 2 : 1) || count > 200 || (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)) {
      setError("Ingresa entre 1 y 200 simulaciones (al menos 2 para el Comité) y una semilla entera válida (0 a 4294967295).");
      return;
    }
    if (typeof Worker === "undefined") {
      setError("Este navegador no admite los recursos necesarios para ejecutar la simulación paralela.");
      return;
    }
    stop();
    const current = generation.current;
    const chosenSeed = seed;
    setActualSeed(chosenSeed); setActualPlan(plan); setActualDifficulty(difficulty); setTotal(count); setSamples([]); setPairs([]); setPolicy(null); setSelectedIndex(null); setError(""); setRunning(true);
    let selectedPolicy: PublishedPolicy | null = null;
    if (plan === "COMMITTEE") {
      try {
        const response = await fetch("/api/committee/policies/latest", { credentials: "same-origin" });
        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok || !contentType.includes("application/json")) {
          const noPublishedPolicy = response.status === 404 || contentType.includes("text/html");
          if (!noPublishedPolicy) {
            throw new Error(
              "No se pudo obtener la política publicada del Comité (el registro no está disponible o el servidor respondió con un formato no válido)."
            );
          }
          selectedPolicy = parsePublishedPolicy(DEFAULT_PUBLISHED_POLICY);
        } else {
          selectedPolicy = parsePublishedPolicy(await response.json());
        }
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
  const sgcMeanDaily = pairs.length ? dailyCumulativeBand(pairs.map((pair) => pair.sgc.daily)).map((point) => point.mean) : null;
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
        <div>Semilla: {seed} <button type="button" className="secondary-button" disabled={running} onClick={() => setSeed(Math.floor(Math.random() * 4294967296))}>Generar semilla aleatoria</button></div>
                <button className="primary-button" disabled={running} onClick={start}>Ejecutar simulaciones</button>
        {running && <button className="secondary-button" onClick={() => { stop(); setRunning(false); setError("Simulación cancelada."); }}>Cancelar</button>}
      </section>
      {plan === "COMMITTEE" && (
        <p className="simulation-note" style={{ marginTop: "-8px", marginBottom: "8px", color: "#94a3b8" }}>
          💡 <strong>Nota sobre dificultad:</strong> La política del Comité está optimizada sobre el grafo original de 16 zonas, por lo que la dificultad permanece fijada en <em>Normal · 16 zonas</em>. Para probar 32 o 48 sectores, selecciona <em>Cortafuegos automático</em> o <em>Intervención al azar</em>.
        </p>
      )}
      <p className="simulation-note">Cada corrida combina la semilla base con un índice secuencial para simular variantes probabilísticas distintas del mismo brote (método Monte Carlo). Repetir la misma semilla reproducirá exactamente las mismas variantes. Máximo cuatro procesos paralelos. La política del Comité se consulta al servidor; las corridas permanecen en el navegador. En difícil y extremo, los sectores son subdivisiones sintéticas: conservan la población, pero sus conexiones son estimadas y no están calibradas.</p>
      <p role="status" className="simulation-status">{error || (running ? `Simulando ${completedCount} de ${total}…` : finished ? `Completadas ${total} simulaciones · semilla ${actualSeed}` : "Configura tu análisis para comenzar.")}</p>
      {running && <progress max={total} value={completedCount} aria-label="Progreso de simulación" />}
      {finished && comparison && policy && candidateInfected && <section aria-label="Evaluación de la política del Comité" className="simulation-results">
        <p className="simulation-note">Política {policy.artifact.policyVersion} · registro {policy.registryVersion} · {policy.artifact.recommendation === "sgc-fallback" ? "alternativa SGC (sin mejora aprobada)" : "entrenada y publicada"} · 16 zonas · {policy.artifact.params.days} días · semilla {actualSeed} · {pairs.length} pares ({pairs.length * 2} corridas).</p>
        <div className="simulation-metrics">
          <MetricCard
            label="Mejora de contagios frente a SGC"
            value={comparison.improvementPercent === null ? "No definida" : `${comparison.improvementPercent >= 0 ? "+" : ""}${comparison.improvementPercent.toFixed(2)}%`}
            help="Porcentaje promedio de casos de contagio evitados por la política entrenada del Comité en comparación con la heurística base Smart Graph Cortafuegos (SGC) bajo exactamente las mismas semillas."
          />
          <MetricCard
            label="Contagios promedio · política"
            value={format(comparison.candidateMean)}
            help="Media aritmética del total de habitantes infectados acumulados al cierre del horizonte aplicando la política publicada del Comité."
          />
          <MetricCard
            label="Contagios promedio · SGC"
            value={format(comparison.sgcMean)}
            help="Media aritmética del total de habitantes infectados acumulados bajo la estrategia base Smart Graph Cortafuegos (SGC) en los mismos pares de réplicas."
          />
          <MetricCard
            label="Política · mínimo / mediana / máximo"
            value={`${format(candidateInfected.min)} / ${format(candidateInfected.median)} / ${format(candidateInfected.max)}`}
            help="Tres escenarios clave de la política: el brote más leve observado (mínimo), el escenario típico central donde la mitad de las corridas son mejores y la otra mitad peores (mediana P50), y el escenario más severo (máximo)."
          />
          <MetricCard
            label="Política · rango P10–P90"
            value={`${format(comparison.p10)} – ${format(comparison.p90)}`}
            help="Intervalo interdecil: concentra el 80% central de las simulaciones, descartando el 10% más optimista y el 10% más extremo para medir la dispersión real del riesgo."
          />
          <MetricCard
            label="Política · corridas con colapso"
            value={`${candidateCollapse} de ${pairs.length}`}
            help="Cantidad de simulaciones en las que los infectados activos simultáneos superaron la capacidad crítica del Hospital Rodríguez Zambrano durante al menos un día."
          />
        </div>
        <p>Diferencia pareada promedio (SGC menos política): {format(comparison.meanDifference)} contagios. Intervalo bootstrap del 95%: {format(comparison.confidenceInterval[0])} a {format(comparison.confidenceInterval[1])} contagios.</p>
        <CumulativeChart title="Contagios de la política vs. SGC" caption={selectedPair ? `Par ${selectedPair.index}: política ${format(selectedPair.candidate.infected)} · SGC ${format(selectedPair.sgc.infected)}` : `Promedio de la política (verde) vs. promedio SGC (coral) y banda P10–P90 · semilla ${actualSeed}`} band={pairBand} selected={selectedPair?.candidate.daily ?? null} comparison={selectedPair?.sgc.daily ?? sgcMeanDaily} label={selectedPair ? `Curva del par ${selectedPair.index}. La línea clara es la política y la coral es SGC.` : "Comparación del promedio de la política con banda P10–P90 frente al promedio de SGC."} />
        {selectedPair && <button className="secondary-button" type="button" onClick={() => setSelectedIndex(null)}>Volver al promedio</button>}
        <div className="simulation-toolbar"><p className="simulation-note">Cada fila es un par con la misma semilla y el mismo índice. La diferencia es SGC menos política. El CSV trae ambos lados sin redondear.</p><button className="secondary-button" type="button" onClick={() => downloadCsv(`comite-${actualSeed}.csv`, pairsToCsv({ plan: planLabel, difficulty: "16 zonas", seed: actualSeed!, policyVersion: policy.artifact.policyVersion, registryVersion: policy.registryVersion }, pairs))}>Descargar CSV</button></div>
        <DatasetDictionary mode="committee" />
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
          <MetricCard
            label="Contagios acumulados · promedio"
            value={format(infected.mean)}
            help="Promedio aritmético del total de personas que se infectaron desde el Día 0 hasta el final de la simulación entre todas las corridas Monte Carlo."
          />
          <MetricCard
            label="Contagios · mínimo / mediana / máximo"
            value={`${format(infected.min)} / ${format(infected.median)} / ${format(infected.max)}`}
            help="Resumen de extremos: la corrida con menos contagios (mínimo), la corrida central típica (mediana, percentil 50) y la corrida más grave (máximo)."
          />
          <MetricCard
            label="Rango P10–P90"
            value={`${format(infected.p10)} – ${format(infected.p90)}`}
            help="Banda donde se ubica el 80% de las simulaciones (entre el percentil 10 y el percentil 90). Cuanto más estrecho es este rango, más predecible es el plan."
          />
          <MetricCard
            label="Pico infeccioso · promedio"
            value={format(distribution(samples.map((sample) => sample.peak)).mean)}
            help="Promedio del número máximo de infectados activos simultáneos en un mismo día; indica el momento de mayor presión sobre el sistema hospitalario."
          />
          <MetricCard
            label="Gasto total · promedio"
            value={`$${format(distribution(samples.map((sample) => sample.spent)).mean)}`}
            help="Presupuesto municipal acumulado promedio invertido en lotes de vacunas, fumigación vectorial y cordones sanitarios a lo largo de la corrida."
          />
          <MetricCard
            label="Corridas con colapso hospitalario"
            value={`${collapseRuns} de ${samples.length}`}
            help="Cantidad de variantes simuladas en las que los casos activos simultáneos superaron la capacidad máxima del Hospital Rodríguez Zambrano al menos un día."
          />
        </div>
        <CumulativeChart title="Contagios acumulados" caption={selectedSample ? `Corrida ${selectedSample.index} · semilla ${selectedSample.seed} · día del pico ${selectedSample.peakDay}` : `Promedio y banda P10–P90 · ${Math.max(0, band.length - 1)} días · semilla ${actualSeed}`} band={band} selected={selectedSample?.daily ?? null} label={selectedSample ? `Curva de la corrida ${selectedSample.index}: de ${format(selectedSample.daily[0] ?? 0)} a ${format(selectedSample.daily.at(-1) ?? 0)} contagios` : `Promedio de ${format(band[0]?.mean ?? 0)} a ${format(band.at(-1)?.mean ?? 0)} contagios, con banda P10–P90`} />
        {selectedSample && <button className="secondary-button" type="button" onClick={() => setSelectedIndex(null)}>Volver al promedio</button>}
        <div className="simulation-toolbar"><p className="simulation-note">Elige una corrida para ver su curva. El CSV trae los valores sin redondear.</p><button className="secondary-button" type="button" onClick={() => downloadCsv(`simulacion-${actualSeed}.csv`, samplesToCsv({ plan: planLabel, difficulty: difficultyLabel, seed: actualSeed! }, samples))}>Descargar CSV</button></div>
        <DatasetDictionary mode="standard" />
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
