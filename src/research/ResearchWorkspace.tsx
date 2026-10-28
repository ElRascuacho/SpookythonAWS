import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Dna,
  FlaskConical,
  Settings2,
  FolderOpen,
  MessageSquare,
  PanelLeftClose,
  ChartNoAxesCombined,
  X,
} from "lucide-react";
import { CureEarth3DMap } from "../components/CureEarth3DMap";
import { ModeTabs } from "../ModeShell";
import { Maximize2, Minimize2 } from "lucide-react";
import { MANTA_NODES, NODE_MAP } from "../domain/mantaGraph";
import { runSingleSeirSimulation } from "../domain/seirEngine";
import {
  AgentReplySchema,
  MeasureSchema,
  WorkspaceSchema,
  STORAGE_KEY,
  decodeWorkspace,
  newWorkspace,
  readWorkspace,
  resolveResearchEffects,
  type Measure,
  type ResearchWorkspace as Workspace,
} from "../domain/research";
import type {
  SimulationParams,
  SingleSimulationRunResult,
} from "../domain/types";

const labels: Record<string, string> = {
  betaHuman: "Transmisión humana β",
  betaVector: "Transmisión vectorial",
  sigma: "Fin de incubación σ",
  gamma: "Recuperación γ",
  hospitalCapacity: "Capacidad hospitalaria",
  vaccineEfficacy: "Eficacia vacunal",
  dailyBudget: "Presupuesto diario ($)",
  vaccineCost: "Costo lote vacunas ($)",
  vaccineBatchSize: "Dosis por lote",
  fumigationCost: "Costo fumigación ($)",
  cordonCost: "Costo cordón ($)",
  days: "Horizonte (días)",
  seed: "Semilla",
  initialInfectedPerNode: "Infectados iniciales por origen",
  initialExposedPerNode: "Expuestos iniciales por origen",
};
const researchNodes = MANTA_NODES.map((n) => ({
  ...n,
  id: n.id as Measure["zones"][number],
}));
const mainParams = ["days", "seed", "dailyBudget", "betaHuman", "betaVector"];
const initialResult = (params = newWorkspace().params) =>
  runSingleSeirSimulation({ ...params, days: 0 }, "NO_INTERVENTION", 0);
export function ResearchWorkspace({
  visible,
  gameParams,
  cameraBridge,
  onBack,
}: {
  visible: boolean;
  gameParams: SimulationParams | null;
  onBack: () => void;
  cameraBridge?: import("../components/tacticalCamera").TacticalCameraBridge;
}) {
  const [loaded] = useState(() => {
    try {
      return { workspace: readWorkspace() ?? newWorkspace(), error: "" };
    } catch {
      return {
        workspace: newWorkspace(),
        error:
          "El archivo local no se pudo validar. No se sobrescribirá hasta guardar explícitamente.",
      };
    }
  });
  const [w, setW] = useState<Workspace>(loaded.workspace);
  const [error, setError] = useState(loaded.error);
  const [saveStatus, setSaveStatus] = useState("");
  const [autoSave, setAutoSave] = useState(!loaded.error);
  const [selected, setSelected] = useState("N01");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [chat, setChat] = useState<{ role: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(800);
  const [day, setDay] = useState(0);
  const [result, setResult] = useState<SingleSimulationRunResult>(() =>
    initialResult(loaded.workspace.params),
  );
  const [manifest, setManifest] = useState<Workspace | null>(null);
  const [view, setView] = useState<"scenario" | "measures">("measures");
  const [panelOpen, setPanelOpen] = useState(true);
  const [agentWide, setAgentWide] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [curveOpen, setCurveOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  const latest = useRef(w);
  latest.current = w;
  const draft = w.drafts.find((d) => d.id === draftId) ?? null;
  const snapshot = result.timeline[Math.min(day, result.timeline.length - 1)];
  const stale = manifest && JSON.stringify(manifest) !== JSON.stringify(w);
  useEffect(() => {
    if (!visible) {
      setRunning(false);
      request.current?.abort();
    }
  }, [visible]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!autoSave) return;
    const timer = setTimeout(() => {
      try {
        const valid = WorkspaceSchema.parse(w);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
        setSaveStatus("Guardado en este navegador");
      } catch {
        setSaveStatus(
          "Sin guardar: configuración inválida o almacenamiento no disponible",
        );
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [w, autoSave]);
  useEffect(() => {
    if (!visible || !running) return;
    const timer = setTimeout(
      () =>
        setDay((d) => {
          if (d >= result.timeline.length - 1) {
            setRunning(false);
            return d;
          }
          return d + 1;
        }),
      speed,
    );
    return () => clearTimeout(timer);
  }, [visible, running, day, speed, result]);
  function updateMeasure(definition: Measure) {
    setRunning(false);
    setW((s) => ({
      ...s,
      drafts: s.drafts.map((d) =>
        d.id === draftId ? { ...d, definition, revision: d.revision + 1 } : d,
      ),
    }));
  }
  function begin() {
    setRunning(false);
    try {
      const config = WorkspaceSchema.parse(w);
      if (
        config.drafts.some(
          (d) =>
            d.enabled && (d.confirmedRevision !== d.revision || !d.confirmed),
        )
      )
        throw Error("Confirma o desactiva todas las medidas antes de iniciar.");
      const frozen = structuredClone(config);
      const measures = frozen.drafts
        .filter((d) => d.enabled)
        .map((d) => ({ id: d.id, definition: d.confirmed! }));
      const simulation = runSingleSeirSimulation(
        frozen.params,
        frozen.strategy,
        0,
        undefined,
        undefined,
        measures.length
          ? {
              resolveDailyEffects: (day, state, budget) =>
                resolveResearchEffects(day, state, budget, measures),
            }
          : undefined,
      );
      setManifest(frozen);
      setResult(simulation);
      setDay(0);
      setRunning(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar.");
    }
  }
  function fresh(source?: SimulationParams) {
    if (
      !window.confirm(
        "¿Crear otro experimento? Se reemplazará la configuración local actual. Exporta primero si deseas conservarla.",
      )
    )
      return;
    request.current?.abort();
    setRunning(false);
    setW(newWorkspace(source));
    setDraftId(null);
    setChat([]);
    setManifest(null);
    setDay(0);
    setResult(initialResult(newWorkspace(source).params));
    setAutoSave(true);
    setError("");
    setView("scenario");
  }
  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(WorkspaceSchema.parse(w)),
      );
      setAutoSave(true);
      setSaveStatus("Guardado en este navegador");
      setError("");
    } catch {
      setError(
        "No se pudo guardar: valida la configuración y el almacenamiento del navegador.",
      );
    }
  }
  function download() {
    try {
      const data = WorkspaceSchema.parse(w);
      const payload = { ...data };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "manta-investigacion-v1.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Corrige la configuración antes de exportar.");
    }
  }
  async function importFile(file: File) {
    try {
      if (file.size > 1_000_000) throw Error("Límite de importación: 1 MB.");
      const data = decodeWorkspace(await file.text());
      if (
        !window.confirm(
          "¿Reemplazar el experimento local? Las medidas importadas requerirán nueva confirmación.",
        )
      )
        return;
      request.current?.abort();
      setRunning(false);
      setW({
        ...data,
        drafts: data.drafts.map((d) => ({
          ...d,
          confirmed: null,
          confirmedRevision: 0,
        })),
      });
      setManifest(null);
      setDay(0);
      setResult(initialResult(data.params));
      setChat([]);
      setDraftId(null);
      setAutoSave(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archivo inválido.");
    }
  }
  async function ask() {
    if (busy || !prompt.trim()) return;
    if (!draft && w.drafts.length >= 8) {
      setError("Máximo ocho medidas por experimento.");
      return;
    }
    try {
      if (draft) MeasureSchema.parse(draft.definition);
    } catch {
      setError("Corrige los parámetros antes de pedir otra edición al agente.");
      return;
    }
    const base = JSON.stringify(w),
      target = draftId,
      message = prompt.trim();
    setChat((s) => [...s, { role: "Tú", text: message }].slice(-20));
    setPrompt("");
    setBusy(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/research/agent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          current: draft?.definition ?? null,
          history: chat.slice(-8).map((m) => ({
            role: m.role === "Tú" ? "user" : "assistant",
            text: m.text,
          })),
        }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.message ?? "No se pudo consultar al agente.");
      const parsed = AgentReplySchema.parse({
        reply: body.reply,
        proposal: body.proposal ?? null,
      });
      if (base !== JSON.stringify(latest.current))
        throw Error(
          "La configuración cambió durante la consulta. La respuesta no sobrescribió tus cambios; vuelve a solicitarla.",
        );
      if (controller.signal.aborted) return;
      setChat((s) =>
        [...s, { role: `Agente · ${body.model}`, text: parsed.reply }].slice(
          -20,
        ),
      );
      if (parsed.proposal) {
        const id = target ?? crypto.randomUUID();
        setW((s) => ({
          ...s,
          drafts: target
            ? s.drafts.map((d) =>
                d.id === target
                  ? {
                      ...d,
                      definition: parsed.proposal!,
                      revision: d.revision + 1,
                    }
                  : d,
              )
            : [
                ...s.drafts,
                {
                  id,
                  definition: parsed.proposal!,
                  revision: 1,
                  confirmedRevision: 0,
                  confirmed: null,
                  enabled: true,
                  history: [],
                },
              ],
        }));
        setDraftId(id);
      }
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Consulta cancelada o tiempo agotado. No se modificó la medida."
          : e instanceof Error
            ? e.message
            : "Error del proveedor.",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      request.current = null;
    }
  }
  const parameter = (key: string) => (
    <label key={key}>
      {labels[key]}
      <input
        type="number"
        step={
          [
            "betaHuman",
            "betaVector",
            "sigma",
            "gamma",
            "vaccineEfficacy",
          ].includes(key)
            ? ".01"
            : "1"
        }
        value={w.params[key as keyof SimulationParams] as number}
        onChange={(e) => {
          setRunning(false);
          setW((s) => ({
            ...s,
            params: { ...s.params, [key]: Number(e.target.value) },
          }));
        }}
      />
    </label>
  );
  const observed = result.timeline.slice(0, day + 1);
  const max = Math.max(1, ...observed.map((s) => s.totalI));
  return (
    <section
      className={`research-workspace ${visible ? "is-active" : ""} ${panelOpen ? "rw-panel-open" : ""} ${agentWide ? "rw-agent-wide" : ""}`}
      inert={!visible}
      aria-hidden={!visible}
      aria-label="Espacio de investigación"
      tabIndex={-1}
    >
      <header className="hub-topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
          aria-label="Volver al juego"
        >
          <span className="brand-mark">
            <Dna size={26} />
          </span>
          <span>
            MANTA<span className="brand-zero">CERO</span>
            <small>LABORATORIO · MODELO SEIR-V</small>
          </span>
        </a>
        <div className="mission-badge">
          <span className="live-dot" /> INVESTIGACIÓN{" "}
          <span className="badge-divider">/</span>
          <b>EXPERIMENTO INDEPENDIENTE</b>
        </div>
        <nav
          className="header-actions"
          aria-label="Herramientas de investigación"
        >
          <ModeTabs />
          <button
            aria-label="Agente de investigación"
            aria-pressed={panelOpen && view === "measures"}
            onClick={() => {
              setPanelOpen(true);
              setView("measures");
            }}
          >
            <MessageSquare size={16} />
            <span>Agente</span>
          </button>
          <button
            aria-label="Configurar escenario"
            aria-pressed={panelOpen && view === "scenario"}
            onClick={() => {
              setPanelOpen(true);
              setView("scenario");
            }}
          >
            <Settings2 size={16} />
            <span>Escenario</span>
          </button>
          <button
            aria-label="Evolución del experimento"
            aria-pressed={curveOpen}
            onClick={() => setCurveOpen((v) => !v)}
          >
            <ChartNoAxesCombined size={16} />
            <span>Evolución</span>
          </button>
          <button
            aria-label="Archivo del experimento"
            aria-expanded={fileOpen}
            onClick={() => setFileOpen((v) => !v)}
          >
            <FolderOpen size={16} />
            <span>Archivo</span>
          </button>
          <button aria-label="Volver al juego" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>Volver al juego</span>
          </button>
        </nav>
      </header>
      <section
        className="rw-filemenu rw-floating"
        data-open={fileOpen}
        aria-hidden={!fileOpen}
        inert={!fileOpen}
        aria-label="Archivo del experimento"
      >
        <div className="rw-actions">
          <button onClick={() => fresh()}>Nuevo experimento</button>
          <button disabled={!gameParams} onClick={() => fresh(gameParams!)}>
            Copiar escenario del juego
          </button>
          <button onClick={save}>Guardar</button>
          <button onClick={download}>Exportar</button>
          <label className="rw-file">
            Importar
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p>
          La copia utiliza parámetros iniciales, no el estado actual ni
          recompensas. {saveStatus}
        </p>
      </section>
      {error && (
        <p role="alert" className="rw-error">
          {error}
        </p>
      )}
      {!panelOpen && (
        <button
          className="rw-open-agent"
          onClick={() => {
            setPanelOpen(true);
            setView("measures");
          }}
        >
          <MessageSquare size={16} /> Agente
        </button>
      )}
      <div className="rw-layout">
        <aside
          className="rw-controls rw-floating"
          data-open={panelOpen}
          aria-hidden={!panelOpen}
          inert={!panelOpen}
        >
          <div className="rw-panel-title">
            <span>
              <FlaskConical size={14} /> LABORATORIO
            </span>
            <span>
              <button
                type="button"
                aria-pressed={agentWide}
                aria-label={agentWide ? "Reducir panel del agente" : "Ampliar panel del agente a un tercio"}
                onClick={() => setAgentWide((open) => !open)}
              >
                {agentWide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                aria-label="Plegar panel del agente"
                onClick={() => setPanelOpen(false)}
              >
                <PanelLeftClose size={16} />
              </button>
            </span>
          </div>
          <nav className="rw-subtabs">
            {[
              ["scenario", "Escenario"],
              ["measures", "Medidas / Agente"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={view === id}
                onClick={() => setView(id as typeof view)}
              >
                {label}
              </button>
            ))}
          </nav>
          {view === "scenario" && (
            <div className="rw-content">
              <h2>Configuración independiente</h2>
              <div className="rw-fields">
                {mainParams.map(parameter)}
                <label>
                  Política automática
                  <select
                    value={w.strategy}
                    onChange={(e) => {
                      setRunning(false);
                      setW((s) => ({
                        ...s,
                        strategy: e.target.value as Workspace["strategy"],
                      }));
                    }}
                  >
                    <option value="NO_INTERVENTION">
                      Sin política adicional
                    </option>
                    <option value="SMART_CORTAFUEGOS">
                      SGC (presupuesto remanente)
                    </option>
                    <option value="RANDOM">Intervención al azar</option>
                  </select>
                </label>
              </div>
              <fieldset>
                <legend>Orígenes del brote</legend>
                {researchNodes.map((n) => (
                  <label className="rw-check" key={n.id}>
                    <input
                      type="checkbox"
                      checked={w.params.patientZeroIds.includes(n.id)}
                      onChange={(e) => {
                        setRunning(false);
                        setW((s) => ({
                          ...s,
                          params: {
                            ...s.params,
                            patientZeroIds: e.target.checked
                              ? [...s.params.patientZeroIds, n.id]
                              : s.params.patientZeroIds.filter(
                                  (id) => id !== n.id,
                                ),
                          },
                        }));
                      }}
                    />
                    {n.name}
                  </label>
                ))}
              </fieldset>
              <details>
                <summary>Parámetros avanzados</summary>
                <div className="rw-fields">
                  {Object.keys(labels)
                    .filter((k) => !mainParams.includes(k))
                    .map(parameter)}
                </div>
              </details>
              <p>
                Costos de medidas primero, política después. Sin medidas y con
                la misma política, el motor conserva su comportamiento.
                Horizonte finito; no se infiere prevención posterior.
              </p>
            </div>
          )}
          {view === "measures" && (
            <div className="rw-content">
              <div className="rw-actions">
                <select
                  aria-label="Medida a editar"
                  value={draftId ?? ""}
                  onChange={(e) => setDraftId(e.target.value || null)}
                >
                  <option value="">Crear nueva medida</option>
                  {w.drafts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.definition.name} · r{d.revision}
                    </option>
                  ))}
                </select>
                <button onClick={() => setDraftId(null)}>Nueva</button>
              </div>
              <div className="rw-chat" role="log" aria-live="polite" aria-relevant="additions" aria-atomic="false" aria-label="Conversación con el agente">
                {chat.length === 0 && (
                  <div>
                    <strong>AGENTE DE INVESTIGACIÓN</strong>
                    <p>
                      Describe la intervención que deseas explorar. Revisaremos
                      sus parámetros, supuestos y efectos antes de aplicarla al
                      experimento.
                    </p>
                  </div>
                )}
                {chat.length ? (
                  chat.map((m, i) => (
                    <article key={i}>
                      <small>{m.role}</small>
                      <p>{m.text}</p>
                    </article>
                  ))
                ) : (
                  <p>
                    Describe una medida o una modificación: «Crea un toque de
                    queda de 22:00 a 05:00 en Tarqui, exceptúa corredores del
                    hospital y deja editables cumplimiento y costo». El agente
                    real pedirá aclaraciones o propondrá supuestos visibles.
                  </p>
                )}
              </div>
              <p className="rw-agent-status" role="status">{busy ? 'Consultando al agente…' : ''}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask();
                }}
                className="rw-composer"
              >
                <textarea
                  aria-label="Petición al agente"
                  maxLength={2000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe tu medida…"
                  required
                />
                <button disabled={busy} type="submit">
                  {busy ? "Consultando Luna…" : "Enviar a Luna"}
                </button>
              </form>
              {draft && (
                <section className="rw-measure">
                  <h2>{draft.definition.name}</h2>
                  <p>{draft.definition.description}</p>
                  <small>
                    Revisión {draft.revision} ·{" "}
                    {draft.confirmedRevision === draft.revision
                      ? "Confirmada"
                      : "Pendiente de confirmación"}
                  </small>
                  <label className="rw-check">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) => {
                        setRunning(false);
                        setW((s) => ({
                          ...s,
                          drafts: s.drafts.map((d) =>
                            d.id === draft.id
                              ? { ...d, enabled: e.target.checked }
                              : d,
                          ),
                        }));
                      }}
                    />
                    Incluir en la próxima ejecución
                  </label>
                  <div className="rw-fields">
                    {draft.definition.times.map((p, i) => (
                      <label key={p.key}>
                        {p.label}
                        <input
                          type="time"
                          value={p.value}
                          onChange={(e) =>
                            updateMeasure({
                              ...draft.definition,
                              times: draft.definition.times.map((x, j) =>
                                j === i ? { ...x, value: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                    {draft.definition.numbers.map((p, i) => (
                      <label key={p.key}>
                        {p.label} ({p.unit})
                        <input
                          type="number"
                          min={p.min}
                          max={p.max}
                          step="any"
                          value={p.value}
                          onChange={(e) =>
                            updateMeasure({
                              ...draft.definition,
                              numbers: draft.definition.numbers.map((x, j) =>
                                j === i
                                  ? { ...x, value: Number(e.target.value) }
                                  : x,
                              ),
                            })
                          }
                        />
                        <small>
                          {p.min}–{p.max}
                        </small>
                      </label>
                    ))}
                    <label>
                      Día inicial
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={draft.definition.firstDay}
                        onChange={(e) =>
                          updateMeasure({
                            ...draft.definition,
                            firstDay: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Día final
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={draft.definition.lastDay}
                        onChange={(e) =>
                          updateMeasure({
                            ...draft.definition,
                            lastDay: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <fieldset>
                    <legend>Zonas</legend>
                    {researchNodes.map((n) => (
                      <label key={n.id} className="rw-check">
                        <input
                          type="checkbox"
                          checked={draft.definition.zones.includes(n.id)}
                          onChange={(e) =>
                            updateMeasure({
                              ...draft.definition,
                              zones: e.target.checked
                                ? [...draft.definition.zones, n.id]
                                : draft.definition.zones.filter(
                                    (id) => id !== n.id,
                                  ),
                            })
                          }
                        />
                        {n.name}
                      </label>
                    ))}
                  </fieldset>
                  <p className="rw-warning">
                    Supuestos a aceptar: {draft.definition.assumptions}
                  </p>
                  <p>
                    Canales:{" "}
                    {draft.definition.effects.map((e) => e.channel).join(", ")}.
                    Horario uniforme aproximado; condición:{" "}
                    {draft.definition.thresholdKey ?? "ninguna"}. Corredores
                    exceptuados:{" "}
                    {draft.definition.excludedEdges.join(", ") || "ninguno"}.
                  </p>
                  {draft.history.length > 0 && (
                    <details>
                      <summary>
                        Historial de confirmaciones ({draft.history.length})
                      </summary>
                      {draft.history.map((h) => (
                        <p key={h.revision}>
                          Revisión {h.revision}: {h.definition.name} ·{" "}
                          {h.definition.assumptions}
                        </p>
                      ))}
                    </details>
                  )}
                  <button
                    disabled={
                      !MeasureSchema.safeParse(draft.definition).success
                    }
                    onClick={() => {
                      setRunning(false);
                      setW((s) => ({
                        ...s,
                        drafts: s.drafts.map((d) =>
                          d.id === draft.id
                            ? {
                                ...d,
                                confirmed: structuredClone(d.definition),
                                confirmedRevision: d.revision,
                                history: [
                                  ...d.history.filter(
                                    (h) => h.revision !== d.revision,
                                  ),
                                  {
                                    revision: d.revision,
                                    definition: structuredClone(d.definition),
                                  },
                                ].slice(-20),
                              }
                            : d,
                        ),
                      }));
                    }}
                  >
                    Confirmar revisión y supuestos
                  </button>
                  <button
                    onClick={() => {
                      setRunning(false);
                      setW((s) => ({
                        ...s,
                        drafts: s.drafts.filter((d) => d.id !== draft.id),
                      }));
                      setDraftId(null);
                    }}
                  >
                    Eliminar medida
                  </button>
                  {!MeasureSchema.safeParse(draft.definition).success && (
                    <p role="alert">
                      Parámetros inválidos: revisa rangos, calendario, horario y
                      referencias antes de confirmar.
                    </p>
                  )}
                </section>
              )}
            </div>
          )}
        </aside>
        <section
          className="rw-inspector rw-floating"
          data-open={inspecting}
          aria-hidden={!inspecting}
          inert={!inspecting}
          aria-label="Inspección de zona"
        >
          <button
            className="rw-close"
            aria-label="Cerrar inspección"
            onClick={() => setInspecting(false)}
          >
            <X size={16} />
          </button>
          <div className="rw-content">
            <h2>Inspección de zona</h2>
            <h3>{NODE_MAP[selected].name}</h3>
            <dl>
              {(["S", "E", "I", "R"] as const).map((k) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{snapshot.nodes[selected][k].toLocaleString("es-EC")}</dd>
                </div>
              ))}
            </dl>
            <h3>Traza de medidas · día {day}</h3>
            {snapshot.researchEffects?.trace
              .filter((t) => t.nodeId === selected)
              .map((t, i) => (
                <p key={i}>
                  <strong>{t.name}</strong>:{" "}
                  {t.applied ? `aplicada ($${t.cost})` : t.reason}
                </p>
              )) ?? <p>Sin efectos de medidas en este día.</p>}
            <p>
              Contactos relativos:{" "}
              {snapshot.researchEffects?.local[selected]?.toFixed(3) ?? "1.000"}
            </p>
            <details>
              <summary>Movilidad aplicada por corredor</summary>
              {Object.entries(snapshot.researchEffects?.mobility ?? {})
                .filter(([, v]) => v !== 1)
                .map(([id, v]) => (
                  <p key={id}>
                    {id}: {v.toFixed(3)}
                  </p>
                ))}
            </details>
            <p>
              Contagios acumulados = E+I iniciales y nuevas exposiciones S→E. La
              curva es una trayectoria, no una mejora validada ni una
              comparación Monte Carlo.
            </p>
          </div>
        </section>
        <main className="rw-observation">
          <div className="rw-map">
            <CureEarth3DMap
              paused={!visible}
              cameraBridge={cameraBridge}
              snapshot={snapshot}
              selectedNode={selected}
              onSelect={(id) => {
                setSelected(id);
                setInspecting(true);
              }}
              orders={[]}
              patientZeroId={
                (manifest?.params ?? w.params).patientZeroIds[0] ?? "N01"
              }
            />
          </div>
          <footer className="rw-playback command-bar">
            <div className="rw-console-summary">
              <div>
                <small>PRESUPUESTO · USD / DÍA</small>
                <strong>
                  $
                  {(
                    (manifest?.params.dailyBudget ?? w.params.dailyBudget) -
                    snapshot.action.budgetSpent
                  ).toLocaleString("es-EC")}{" "}
                  <small>
                    / $
                    {(
                      manifest?.params.dailyBudget ?? w.params.dailyBudget
                    ).toLocaleString("es-EC")}
                  </small>
                </strong>
              </div>
              <div>
                <small>ZONA · {selected}</small>
                <strong>{NODE_MAP[selected].name}</strong>
              </div>
              <div className="rw-timeline">
                <label>
                  DÍA {String(day).padStart(2, "0")} /{" "}
                  {manifest ? result.timeline.length - 1 : w.params.days}
                  <input
                    aria-label="Día observado"
                    type="range"
                    min="0"
                    max={result.timeline.length - 1}
                    value={day}
                    onChange={(e) => {
                      setRunning(false);
                      setDay(Number(e.target.value));
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="rw-actions">
              <button onClick={begin}>
                Preparar ejecución real / reiniciar
              </button>
              <button
                disabled={!manifest || day >= result.timeline.length - 1}
                onClick={() => {
                  setRunning(false);
                  setDay((d) => Math.min(d + 1, result.timeline.length - 1));
                }}
              >
                Avanzar un día
              </button>
              <button
                disabled={!manifest || day >= result.timeline.length - 1}
                onClick={() => setRunning((r) => !r)}
              >
                {running ? "Pausar" : "Reproducir"}
              </button>
              <label>
                Velocidad
                <select
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  <option value={1600}>Lenta</option>
                  <option value={800}>Normal</option>
                  <option value={250}>Rápida</option>
                </select>
              </label>
            </div>
            <div
              className="rw-active-measures"
              aria-label="Medidas confirmadas"
            >
              {(manifest ?? w).drafts
                .filter((d) => d.enabled)
                .map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setDraftId(d.id);
                      setView("measures");
                      setPanelOpen(true);
                    }}
                  >
                    {d.definition.name} ·{" "}
                    {d.confirmedRevision === d.revision
                      ? "Confirmada"
                      : "Por confirmar"}
                  </button>
                ))}
            </div>
            <p>
              {!manifest
                ? "Configura y prepara una ejecución para comenzar."
                : stale
                  ? "Estás observando una configuración anterior congelada. Prepara otra ejecución para aplicar los cambios."
                  : running
                    ? "Reproduciendo trayectoria determinista."
                    : "Ejecución preparada. Puedes avanzar, reproducir o inspeccionar días."}
            </p>
            <small className="rw-disclaimer">
              Modelo educativo no calibrado · Sin cura ni condiciones de
              victoria · {saveStatus}
            </small>
          </footer>
          <section className="rw-results" aria-label="Situación experimental">
            <div>
              <small>Infecciosos activos</small>
              <strong>{snapshot.totalI.toLocaleString("es-EC")}</strong>
            </div>
            <div>
              <small>Contagios acumulados</small>
              <strong>
                {snapshot.cumulativeInfected.toLocaleString("es-EC")}
              </strong>
            </div>
            <div>
              <small>Recuperados / inmunes</small>
              <strong>{snapshot.totalR.toLocaleString("es-EC")}</strong>
            </div>
            <div>
              <small>Hospital</small>
              <strong>
                {snapshot.hospitalCollapsed ? "Saturado" : "Operativo"}
              </strong>
            </div>
          </section>
          <section
            className="rw-curve rw-floating"
            data-open={curveOpen}
            aria-hidden={!curveOpen}
            inert={!curveOpen}
          >
            <button
              className="rw-close"
              aria-label="Cerrar evolución"
              onClick={() => setCurveOpen(false)}
            >
              <X size={16} />
            </button>
            <h2>Evolución observada · infecciosos activos</h2>
            <svg
              viewBox="0 0 600 130"
              role="img"
              aria-label="Trayectoria observada de infecciosos"
            >
              <polyline
                points={observed
                  .map(
                    (s, i) =>
                      `${(i / Math.max(1, result.timeline.length - 1)) * 590 + 5},${125 - (s.totalI / max) * 115}`,
                  )
                  .join(" ")}
                fill="none"
                stroke="#b1dfc8"
                strokeWidth="2"
              />
            </svg>
            <p>
              Una trayectoria SEIR-V real ·{" "}
              {manifest
                ? `semilla ${manifest.params.seed} · política ${manifest.strategy}`
                : "sin ejecución configurada"}{" "}
              · Sin evaluación masiva.
            </p>
          </section>
        </main>
      </div>
    </section>
  );
}
