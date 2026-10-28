import { useEffect, useMemo, useState, type ComponentType } from "react";
import { ShieldAlert, ShieldCheck, Activity, Award, TrendingDown, DollarSign } from "lucide-react";
import type { Order } from "../domain/cureGame";
import type { DailyCitySnapshot } from "../domain/types";
import { computeCommitteeStats, type CommitteeStats } from "../domain/committee/stats";

interface MapProps {
  snapshot: DailyCitySnapshot;
  selectedNode: string;
  onSelect: (nodeId: string) => void;
  orders: Order[];
  patientZeroId: string;
  paused?: boolean;
}

interface JobView {
  jobId: string;
  status: string;
  stateRevision: number;
  recommendedPolicyVersion: number;
  finalAudit: "not-run" | "passed" | "failed" | string;
  baselineMean: number | null;
  candidateMean: number | null;
  note: string;
  trajectories?: number;
  seedUsed?: number;
  weights?: readonly [number, number, number, number];
  promoted?: boolean;
  warmStartsCount?: number;
  generationsRun?: number;
  librarySize?: number;
}

interface StartResponse extends Partial<JobView> {
  message?: string;
  error?: string;
}

const WEIGHT_LABELS = [
  { key: "w_cordon_early", label: "Cordón Temprano (días 0–13)" },
  { key: "w_fumig_early", label: "Fumigación Temprana (días 0–13)" },
  { key: "w_cordon_late", label: "Cordón Tardío (día 14+)" },
  { key: "w_fumig_late", label: "Fumigación Tardía (día 14+)" },
] as const;

function PlaybackMap({ snapshot }: { snapshot: DailyCitySnapshot }) {
  const [MapView, setMapView] = useState<ComponentType<MapProps> | null>(null);
  useEffect(() => {
    let alive = true;
    void import("../components/CureEarth3DMap").then((mod) => {
      if (alive) setMapView(() => mod.CureEarth3DMap);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!MapView) return null;
  return (
    <MapView
      snapshot={snapshot}
      selectedNode="N01"
      onSelect={() => undefined}
      orders={[]}
      patientZeroId="N01"
      paused
    />
  );
}

export default function CommitteePanel() {
  const [horizonDays, setHorizonDays] = useState(40);
  const [seedMode, setSeedMode] = useState<"random" | "custom">("random");
  const [customSeed, setCustomSeed] = useState(20261030);
  const [runAudit, setRunAudit] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);
  const [playback, setPlayback] = useState<DailyCitySnapshot[]>([]);
  const [day, setDay] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError("");
    setPlayback([]);
    const activeSeed =
      seedMode === "random"
        ? Math.floor(Math.random() * 0x7fffffff) + 1
        : Math.max(0, Math.min(0xffffffff, Math.floor(Number(customSeed) || 0)));
    try {
      const response = await fetch("/api/committee/jobs", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `local-${horizonDays}-${activeSeed}-${runAudit ? "audit" : "preview"}-${Date.now()}`,
        },
        body: JSON.stringify({
          horizonDays,
          seed: activeSeed,
          audit: runAudit,
        }),
      });
      let body: StartResponse | null = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        setError(body?.message ?? body?.error ?? "No se pudo iniciar");
        return;
      }
      if (typeof body?.jobId !== "string") {
        setError("No se pudo iniciar");
        return;
      }
      setJob(body as JobView);
      setDay(0);
    } catch {
      setError("No se pudo conectar. Revisa tu conexiÃ³n y vuelve a intentar.");
    } finally {
      setBusy(false);
    }
  }

  async function resetLibrary() {
    try {
      const response = await fetch("/api/committee/library", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (response.ok) {
        setJob((prev) => (prev ? { ...prev, librarySize: 0 } : null));
      }
    } catch {
      // ignore
    }
  }

  // Polling del estado del Job
  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "cancelled") return;
    const timer = window.setInterval(() => {
      void fetch(`/api/committee/jobs/${job.jobId}`, { credentials: "same-origin" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: JobView | null) => {
          if (!body) return;
          setJob((current) => (!current || body.stateRevision < current.stateRevision ? current : body));
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [job]);

  // Carga del Playback completo una vez completado el Job
  useEffect(() => {
    if (!job || job.status === "queued") return;
    let ignore = false;
    fetch(`/api/committee/jobs/${job.jobId}/playback`, { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!ignore && Array.isArray(body?.playback)) {
          setPlayback(body.playback);
        }
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [job?.jobId, job?.status]);

  // Cálculo de estadísticas consolidadas
  const stats: CommitteeStats | null = useMemo(() => {
    if (!job || job.baselineMean == null) return null;
    return computeCommitteeStats(playback, job.baselineMean, job.candidateMean);
  }, [playback, job]);

  const currentSnapshot = playback[day] ?? null;
  const currentDailyStat = stats?.dailyStats[day] ?? null;
  const learnedWeights = job?.weights ?? [0, 0, 0, 0];

  return (
    <div className="committee-placeholder-panel">
      <style>{`
        .committee-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
          margin-top: 20px;
          margin-bottom: 24px;
        }
        .committee-kpi-card {
          background: rgba(13, 27, 34, 0.85);
          border: 1px solid #243d46;
          border-radius: 8px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .kpi-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #7d9ba6;
          font-weight: 600;
        }
        .kpi-main-metric {
          font-size: 26px;
          font-weight: 700;
          color: #f0f7f9;
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .kpi-badge {
          font-size: 11px;
          padding: 2px 7px;
          border-radius: 4px;
          font-weight: 700;
        }
        .badge-green {
          background: rgba(0, 229, 163, 0.15);
          color: #00e5a3;
          border: 1px solid rgba(0, 229, 163, 0.3);
        }
        .badge-amber {
          background: rgba(255, 179, 0, 0.15);
          color: #ffb300;
          border: 1px solid rgba(255, 179, 0, 0.3);
        }
        .badge-red {
          background: rgba(255, 82, 82, 0.15);
          color: #ff5252;
          border: 1px solid rgba(255, 82, 82, 0.3);
        }
        .badge-blue {
          background: rgba(41, 182, 246, 0.15);
          color: #29b6f6;
          border: 1px solid rgba(41, 182, 246, 0.3);
        }
        .kpi-subtext {
          font-size: 12px;
          color: #8da4ae;
          line-height: 1.4;
        }
        .tactics-progress-bar {
          display: flex;
          height: 8px;
          border-radius: 4px;
          overflow: hidden;
          background: #192d35;
          margin-top: 6px;
        }
        .bar-vaccine { background: #00e5a3; }
        .bar-cordon { background: #ffb300; }
        .bar-fumigation { background: #29b6f6; }
        .tactics-legend {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 6px;
          font-size: 11px;
        }
        .legend-row {
          display: flex;
          justify-content: space-between;
          color: #8da4ae;
        }
        .committee-form-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }
        .audit-toggle-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #b0c6ce;
          cursor: pointer;
        }
        .seed-mode-select {
          background: #0d1b22;
          color: #e2f1f5;
          border: 1px solid #243d46;
          border-radius: 4px;
          padding: 5px 8px;
          font-size: 13px;
        }
        .learning-memory-box {
          background: rgba(13, 27, 34, 0.92);
          border: 1px solid #243d46;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }
        .weights-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 10px;
          margin-top: 12px;
        }
        .weight-chip {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid #1f3740;
          border-radius: 6px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .day-inspection-box {
          background: rgba(10, 21, 26, 0.9);
          border: 1px solid #1f3740;
          border-radius: 6px;
          padding: 14px;
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .day-inspection-metrics {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          font-size: 12px;
          color: #e2f1f5;
        }
        .metric-chip {
          background: rgba(255, 255, 255, 0.05);
          padding: 4px 10px;
          border-radius: 4px;
          border: 1px solid #243d46;
        }
      `}</style>

      <header className="committee-header">
        <div className="committee-title-group">
          <span className="committee-badge">COMITÉ EPIDEMIOLÓGICO</span>
          <h2>¿Qué hace el Comité?</h2>
          <p className="committee-subtitle">
            Busca una política de respuesta que reduzca los contagios acumulados en una simulación mediante aprendizaje continuo sin sobreajuste. Compara la estrategia base con una candidata; es exploratoria, no valida decisiones reales.
          </p>
        </div>
      </header>

      <form
        className="committee-content-frame"
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        <div className="committee-form-row">
          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            Horizonte (días)
            <input
              type="number"
              min={20}
              max={60}
              value={horizonDays}
              onChange={(event) => setHorizonDays(Number(event.target.value))}
              style={{ width: "70px", padding: "4px 8px" }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            Semilla
            <select
              className="seed-mode-select"
              value={seedMode}
              onChange={(event) => setSeedMode(event.target.value as "random" | "custom")}
            >
              <option value="random">🎲 Semilla Aleatoria (Anti-Overfitting)</option>
              <option value="custom">📌 Semilla Específica</option>
            </select>
          </label>

          {seedMode === "custom" && (
            <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              #
              <input
                type="number"
                min={0}
                max={4294967295}
                value={customSeed}
                onChange={(event) => setCustomSeed(Number(event.target.value))}
                style={{ width: "120px", padding: "4px 8px" }}
              />
            </label>
          )}

          <label className="audit-toggle-label">
            <input
              type="checkbox"
              checked={runAudit}
              onChange={(e) => setRunAudit(e.target.checked)}
            />
            Auditoría rigurosa (Held-out seeds)
          </label>

          <button type="submit" disabled={busy}>
            {busy ? "Calculando…" : runAudit ? "Buscar y Auditar" : "Entrenar y Validar"}
          </button>
        </div>

        {error && <p role="alert" style={{ color: "#ff5252" }}>{error}</p>}

        {job && (
          <div className="committee-status-card" style={{ display: "block" }}>
            {/* KPI Cards Grid */}
            <div className="committee-kpi-grid">
              {/* Tarjeta 1: Reducción de Contagios */}
              <div className="committee-kpi-card">
                <div className="kpi-title-row">
                  <span>Eficacia de Contención</span>
                  <TrendingDown size={16} color="#00e5a3" />
                </div>
                <div className="kpi-main-metric">
                  {stats ? `-${stats.reductionPct}%` : "—"}
                  {stats && stats.reductionPct > 0 && (
                    <span className="kpi-badge badge-green">Mitigación</span>
                  )}
                </div>
                <div className="kpi-subtext">
                  <strong>{stats ? stats.reductionAbsolute.toLocaleString() : 0}</strong> contagios evitados frente al escenario base.
                  <br />
                  Baseline: {job.baselineMean == null ? "—" : Math.round(job.baselineMean).toLocaleString()} | Candidata: {job.candidateMean == null ? "—" : Math.round(job.candidateMean).toLocaleString()}
                </div>
              </div>

              {/* Tarjeta 2: Capacidad Hospitalaria */}
              <div className="committee-kpi-card">
                <div className="kpi-title-row">
                  <span>Carga Hospitalaria Pico</span>
                  <Activity size={16} color={stats?.hospitalStatus === "colapso" ? "#ff5252" : "#ffb300"} />
                </div>
                <div className="kpi-main-metric">
                  {stats ? `${stats.peakHospitalLoadPct}%` : "—"}
                  {stats && (
                    <span className={`kpi-badge ${stats.hospitalStatus === "colapso" ? "badge-red" : stats.hospitalStatus === "alerta" ? "badge-amber" : "badge-green"}`}>
                      {stats.hospitalStatus.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="kpi-subtext">
                  Capacidad: <strong>2.500 camas</strong> (H. Rodríguez Zambrano).
                  <br />
                  Días en colapso: <strong>{stats?.collapseDays ?? 0} días</strong>.
                  <br />
                  Tasa de ataque final: <strong>{stats?.attackRatePct ?? 0}%</strong> de la ciudad.
                </div>
              </div>

              {/* Tarjeta 3: Distribución Táctica */}
              <div className="committee-kpi-card">
                <div className="kpi-title-row">
                  <span>Distribución Presupuestaria</span>
                  <DollarSign size={16} color="#29b6f6" />
                </div>
                <div className="kpi-main-metric">
                  ${stats ? stats.totalBudgetSpent.toLocaleString() : "0"}
                </div>
                {stats && (
                  <>
                    <div className="tactics-progress-bar">
                      <div className="bar-vaccine" style={{ width: `${stats.vaccineBudgetPct}%` }} title="Vacunas" />
                      <div className="bar-cordon" style={{ width: `${stats.cordonBudgetPct}%` }} title="Cordones" />
                      <div className="bar-fumigation" style={{ width: `${stats.fumigationBudgetPct}%` }} title="Fumigación" />
                    </div>
                    <div className="tactics-legend">
                      <div className="legend-row">
                        <span>💉 Inmunización:</span>
                        <strong>{stats.vaccineBudgetPct}% ({stats.totalVaccineDoses.toLocaleString()} dosis)</strong>
                      </div>
                      <div className="legend-row">
                        <span>🚧 Cordones:</span>
                        <strong>{stats.cordonBudgetPct}% ({stats.totalCordons} zonas)</strong>
                      </div>
                      <div className="legend-row">
                        <span>💨 Fumigación:</span>
                        <strong>{stats.fumigationBudgetPct}% ({stats.totalFumigations} zonas)</strong>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Tarjeta 4: Dictamen de Auditoría */}
              <div className="committee-kpi-card">
                <div className="kpi-title-row">
                  <span>Auditoría de Generalización</span>
                  <Award size={16} color="#00e5a3" />
                </div>
                <div className="kpi-main-metric" style={{ fontSize: "20px" }}>
                  {job.finalAudit === "passed" && (
                    <span className="kpi-badge badge-green" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <ShieldCheck size={14} /> CERTIFICADA
                    </span>
                  )}
                  {job.finalAudit === "failed" && (
                    <span className="kpi-badge badge-red" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <ShieldAlert size={14} /> RECHAZADA
                    </span>
                  )}
                  {job.finalAudit === "not-run" && (
                    <span className={`kpi-badge ${job.promoted ? "badge-green" : "badge-blue"}`}>
                      {job.promoted ? "VALIDADA EN PROMOCIÓN" : "PRELIMINAR"}
                    </span>
                  )}
                </div>
                <div className="kpi-subtext">
                  Semilla evaluada: <strong>#{job.seedUsed ?? customSeed}</strong> | Versión: <strong>v{job.recommendedPolicyVersion}</strong>.
                  <br />
                  Simulaciones evaluadas: <strong>{job.trajectories ?? (playback.length > 0 ? playback.length : 1)} réplicas</strong> ({job.generationsRun ?? 1} gen).
                  <br />
                  <span style={{ fontSize: "11px", color: "#7d9ba6" }}>{job.note}</span>
                </div>
              </div>
            </div>

            {/* Memoria Evolutiva y Pesos Aprendidos */}
            <div className="learning-memory-box">
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                <div>
                  <strong style={{ color: "#f0f7f9", fontSize: "14px" }}>
                    🧠 Memoria Evolutiva y Pesos Aprendidos (Anti-Overfitting)
                  </strong>
                  <div style={{ fontSize: "12px", color: "#8da4ae", marginTop: "4px" }}>
                    Campeones en memoria (Warm Starts): <strong>{job.librarySize ?? 0} / 8</strong> ({job.warmStartsCount ?? 0} usados en esta corrida) •{" "}
                    Promoción fuera de muestra:{" "}
                    <strong style={{ color: job.promoted ? "#00e5a3" : "#ffb300" }}>
                      {job.promoted ? "Superada (Archivada)" : "Conserva incumbente"}
                    </strong>
                  </div>
                </div>
                {(job.librarySize ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => void resetLibrary()}
                    style={{ fontSize: "11px", padding: "4px 10px", opacity: 0.85 }}
                  >
                    Limpiar Memoria
                  </button>
                )}
              </div>

              <div className="weights-grid">
                {WEIGHT_LABELS.map((item, idx) => {
                  const weight = learnedWeights[idx] ?? 0;
                  const multiplier = Math.exp(weight);
                  return (
                    <div key={item.key} className="weight-chip">
                      <span style={{ fontSize: "11px", color: "#8da4ae" }}>{item.label}</span>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <strong style={{ fontSize: "15px", color: "#e2f1f5" }}>
                          w = {weight >= 0 ? `+${weight.toFixed(2)}` : weight.toFixed(2)}
                        </strong>
                        <span className="kpi-badge badge-blue">
                          Prioridad ×{multiplier.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Slider de Inspección Día a Día */}
            <div style={{ marginTop: "16px" }}>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontWeight: 600, color: "#e2f1f5" }}>Línea de Tiempo de Inspección Táctica: Día {day}</span>
                <span style={{ fontSize: "12px", color: "#8da4ae" }}>0 a {Math.max(0, horizonDays)} días</span>
              </label>
              <input
                type="range"
                min={0}
                max={Math.max(0, horizonDays)}
                value={day}
                onChange={(event) => setDay(Number(event.target.value))}
                style={{ width: "100%" }}
              />

              {currentSnapshot && (
                <div className="day-inspection-box">
                  <div className="day-inspection-metrics">
                    <span className="metric-chip">
                      Infectados Activos: <strong>{Math.round(currentSnapshot.totalI).toLocaleString()}</strong> ({currentDailyStat?.activeInfectionPct ?? 0}%)
                    </span>
                    <span className="metric-chip">
                      Ocupación Hospital: <strong>{currentDailyStat?.hospitalLoadPct ?? 0}%</strong>
                    </span>
                    <span className="metric-chip">
                      Casos Acumulados: <strong>{Math.round(currentSnapshot.cumulativeInfected).toLocaleString()}</strong>
                    </span>
                    <span className="metric-chip">
                      Gasto del Día: <strong>${currentSnapshot.action.budgetSpent.toLocaleString()}</strong>
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "13px", color: "#b0c6ce" }}>
                    <strong>Acciones Día {currentSnapshot.day}:</strong> {currentSnapshot.action.summaryText || "Sin intervenciones activas."}
                  </p>
                  <PlaybackMap snapshot={currentSnapshot} />
                </div>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}


