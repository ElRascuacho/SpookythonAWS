import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Dna,
  FlaskConical,
  Info,
  Settings2,
  FolderOpen,
  MessageSquare,
  PanelLeftClose,
  Maximize2,
  Minimize2,
  ChartNoAxesCombined,
  X,
} from "lucide-react";
import { ResearchVoiceControls } from "./ResearchVoiceControls";
import { ResearchLiveReport, type ReportData } from "./ResearchLiveReport";
import { ResearchWelcome } from "./ResearchWelcome";
import {
  ResearchEvidencePanel,
  type EvidenceContext,
} from "./ResearchEvidencePanel";
import {
  configurationIdentity,
  evidenceSummary,
  INVALID_WORKSPACE_MESSAGE,
  type ResearchContext,
} from "../domain/researchEvidence";
import { SimulationParamsSchema } from "../domain/schemas/simulationParams.schema";
import { AgentReplyText } from "./AgentReplyText";
import { CureEarth3DMap } from "../components/CureEarth3DMap";
import { MANTA_NODES, NODE_MAP } from "../domain/mantaGraph";
import { runSingleSeirSimulation } from "../domain/seirEngine";
import {
  AgentResponseSchema,
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
  const [chat, setChat] = useState<
    {
      id: string;
      role: string;
      text: string;
      report?: { initial: ReportData; createdAt: string };
    }[]
  >([]);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const typingScrollUntil = useRef(0);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(800);
  const [day, setDay] = useState(0);
  const [result, setResult] = useState<SingleSimulationRunResult>(() =>
    initialResult(loaded.workspace.params),
  );
  const [manifest, setManifest] = useState<Workspace | null>(null);
  const [evidenceContext, setEvidenceContext] = useState<EvidenceContext>({
    evidence: null,
    evidenceCurrent: false,
    identity: null,
    committee: null,
    committeeReadAt: null,
  });
  const [view, setView] = useState<"scenario" | "measures">("measures");
  const [panelOpen, setPanelOpen] = useState(true);
  const [welcomeRequest, setWelcomeRequest] = useState(0);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [curveOpen, setCurveOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [rawParams, setRawParams] = useState<Record<string, string>>({});
  const request = useRef<AbortController | null>(null);
  const chatScroll = useRef<HTMLDivElement | null>(null);
  const followChat = useRef(true);
  const autoScrolling = useRef(false);
  const [unreadChat, setUnreadChat] = useState(false);
  const latest = useRef(w);
  latest.current = w;
  const identity = configurationIdentity(w);
  const valid = identity !== null;
  const draft = w.drafts.find((d) => d.id === draftId) ?? null;
  const snapshot = result.timeline[Math.min(day, result.timeline.length - 1)];
  const stale = manifest && JSON.stringify(manifest) !== JSON.stringify(w);
  const agentContext: ResearchContext = {
    schemaVersion: 1,
    selectedMeasure: draft?.definition ?? null,
    editableParameters: w.params,
    executionParameters: manifest?.params ?? null,
    configurationChanged: Boolean(stale),
    observed: {
      day: snapshot.day,
      infected: snapshot.totalI,
      exposed: snapshot.totalE,
      recovered: snapshot.totalR,
      cumulativeInfected: snapshot.cumulativeInfected,
      hospitalCollapsed: snapshot.hospitalCollapsed,
    },
    measures: w.drafts.map((d) => ({
      id: d.id,
      name: d.definition.name,
      revision: d.revision,
      enabled: d.enabled,
      confirmed: Boolean(d.confirmed) && d.confirmedRevision === d.revision,
    })),
    evidence: evidenceSummary(evidenceContext.evidence),
    evidenceCurrent:
      evidenceContext.evidenceCurrent && evidenceContext.identity === identity,
    committee: evidenceContext.committee,
    committeeReadAt: evidenceContext.committeeReadAt,
  };
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
  useEffect(() => {
    const scroll = chatScroll.current;
    if (!visible || view !== "measures" || !scroll) return;
    if (!followChat.current) {
      setUnreadChat(true);
      return;
    }
    autoScrolling.current = true;
    scroll.scrollTo({
      top: scroll.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    setUnreadChat(false);
    const timer = setTimeout(() => {
      autoScrolling.current = false;
    }, 600);
    return () => clearTimeout(timer);
  }, [chat, busy, view, visible, draftId]);

  useEffect(() => {
    const scroll = chatScroll.current;
    if (!visible || view !== "measures" || !scroll) return;
    const observer = new ResizeObserver(() => {
      if (followChat.current)
        scroll.scrollTo({ top: scroll.scrollHeight, behavior: "instant" });
    });
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [visible, view]);

  useEffect(() => {
    if (!visible || view !== "measures") setTypingMessageId(null);
  }, [visible, view, typingMessageId]);

  function userScrollChat() {
    autoScrolling.current = false;
    typingScrollUntil.current = 0;
  }

  function followTyping() {
    const scroll = chatScroll.current;
    if (!scroll || !visible || view !== "measures") return;
    if (!followChat.current) {
      setUnreadChat(true);
      return;
    }
    typingScrollUntil.current = performance.now() + 600;
    scroll.scrollTo({
      top: scroll.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

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
      const parsed = WorkspaceSchema.safeParse(w);
      if (!parsed.success) throw Error(INVALID_WORKSPACE_MESSAGE);
      const config = parsed.data;
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
  async function ask(
    voiceMessage?: string,
    voiceSignal?: AbortSignal,
    voiceTool = false,
  ) {
    if (busy || !(voiceMessage ?? prompt).trim()) return;
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
      message = (voiceMessage ?? prompt).trim();
    followChat.current = true;
    setTypingMessageId(null);
    if (!voiceTool)
      setChat((s) =>
        [...s, { id: crypto.randomUUID(), role: "Tú", text: message }].slice(
          -20,
        ),
      );
    if (voiceMessage === undefined) setPrompt("");
    setBusy(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    const signal = voiceSignal
      ? AbortSignal.any([controller.signal, voiceSignal])
      : controller.signal;
    try {
      const response = await fetch("/api/research/agent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          current: draft?.definition ?? null,
          context: agentContext,
          history: chat.slice(-8).map((m) => ({
            role: m.role === "Tú" ? "user" : "assistant",
            text: m.text,
          })),
        }),
        signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.message ?? "No se pudo consultar al agente.");
      const validated = AgentResponseSchema.safeParse(body);
      if (!validated.success)
        throw Error(
          "La respuesta del agente no tiene un formato válido. No se modificó la medida; vuelve a intentarlo.",
        );
      const parsed = validated.data;
      if (base !== JSON.stringify(latest.current))
        throw Error(
          "La configuración cambió durante la consulta. La respuesta no sobrescribió tus cambios; vuelve a solicitarla.",
        );
      if (signal.aborted) return;
      const replyId = crypto.randomUUID();
      setTypingMessageId(
        voiceMessage !== undefined ||
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? null
          : replyId,
      );
      if (!voiceTool)
        setChat((s) =>
          [
            ...s,
            {
              id: replyId,
              role: `Agente · ${parsed.model}`,
              text: parsed.reply,
            },
          ].slice(-20),
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
      return parsed;
    } catch (e) {
      if (!(voiceTool && signal.aborted))
        setError(
          signal.aborted
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
  const parameter = (key: string) => {
    const value = w.params[key as keyof SimulationParams] as number;
    const raw = rawParams[key] ?? String(value);
    const invalidRaw =
      rawParams[key] !== undefined &&
      (raw.trim() === "" ||
        !SimulationParamsSchema.safeParse({
          ...w.params,
          [key]: Number(raw),
        }).success);
    return (
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
          value={raw}
          aria-invalid={invalidRaw || undefined}
          onChange={(e) => {
            const text = e.target.value;
            setRunning(false);
            setRawParams((d) => ({ ...d, [key]: text }));
            if (text.trim() === "" || !Number.isFinite(Number(text))) return;
            setW((s) =>
              SimulationParamsSchema.safeParse({
                ...s.params,
                [key]: Number(text),
              }).success
                ? { ...s, params: { ...s.params, [key]: Number(text) } }
                : s,
            );
          }}
          onBlur={() =>
            setRawParams((d) => {
              if (!(key in d)) return d;
              const next = { ...d };
              delete next[key];
              return next;
            })
          }
        />
      </label>
    );
  };
  const observed = result.timeline.slice(0, day + 1);
  const reportData: ReportData = {
    context: agentContext,
    identity: identity ?? "",
    points: observed.map((s) => ({ day: s.day, infected: s.totalI })),
  };
  const max = Math.max(1, ...observed.map((s) => s.totalI));
  return (
    <section
      className={`research-workspace ${visible ? "is-active" : ""} ${panelOpen ? "rw-panel-open" : ""} ${panelExpanded ? "rw-panel-expanded" : ""}`}
      inert={!visible}
      aria-hidden={!visible}
      aria-label="Espacio de investigación"
      tabIndex={-1}
    >
      <ResearchWelcome active={visible} openRequest={welcomeRequest} />
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
            ZERO <span className="brand-zero">DAY</span>
            <small>LABORATORIO · MODELO SEIR-V</small>
          </span>
        </a>
        <div className="mission-badge research-mode-badge">
          <FlaskConical size={14} aria-hidden="true" /> INVESTIGACIÓN{" "}
          <span className="badge-divider">/</span>
          <b>EXPERIMENTO INDEPENDIENTE</b>
        </div>
        <nav
          className="header-actions"
          aria-label="Herramientas de investigación"
        >
          <button
            aria-label="Agente de investigación"
            aria-pressed={panelOpen && view === "measures"}
            onClick={() => {
              setPanelOpen(true);
              setInspecting(false);
              setCurveOpen(false);
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
              setInspecting(false);
              setCurveOpen(false);
              setView("scenario");
            }}
          >
            <Settings2 size={16} />
            <span>Escenario</span>
          </button>
          <button
            aria-label="Evolución del experimento"
            aria-pressed={curveOpen}
            onClick={() => {
              if (window.matchMedia("(max-width: 720px)").matches)
                setPanelOpen(false);
              setCurveOpen((v) => !v);
            }}
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
          <button
            type="button"
            className="rw-research-info"
            aria-label="Información de Investigación"
            title="Acerca del módulo de Investigación"
            aria-haspopup="dialog"
            aria-controls="rw-research-welcome"
            onClick={() => setWelcomeRequest((value) => value + 1)}
          >
            <Info size={16} />
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
      {!valid && (
        <p role="alert" className="rw-error">
          {INVALID_WORKSPACE_MESSAGE}
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
              <FlaskConical size={16} />{" "}
              {view === "measures"
                ? "Agente de investigación"
                : "Escenario experimental"}
            </span>
            <div className="rw-panel-actions">
              <button
                aria-label={
                  panelExpanded
                    ? "Reducir panel del agente"
                    : "Ampliar panel del agente"
                }
                aria-pressed={panelExpanded}
                onClick={() => setPanelExpanded((v) => !v)}
              >
                {panelExpanded ? (
                  <Minimize2 size={16} />
                ) : (
                  <Maximize2 size={16} />
                )}
              </button>
              <button
                aria-label="Plegar panel del agente"
                onClick={() => setPanelOpen(false)}
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
          </div>
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
                {researchNodes.map((n) => {
                  const checked = w.params.patientZeroIds.includes(n.id);
                  const lastOrigin =
                    checked && w.params.patientZeroIds.length === 1;
                  return (
                    <label className="rw-check" key={n.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={lastOrigin}
                        title={
                          lastOrigin
                            ? "Debe quedar al menos un origen del brote activo."
                            : undefined
                        }
                        onChange={(e) => {
                          if (
                            !e.target.checked &&
                            w.params.patientZeroIds.length === 1
                          )
                            return;
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
                      {lastOrigin && <small> (obligatorio)</small>}
                    </label>
                  );
                })}
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
            <div className="rw-content rw-agent-content">
              <div className="rw-actions rw-agent-toolbar">
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
                <button onClick={() => setDraftId(null)}>Nueva medida</button>
              </div>
              <div
                className="rw-agent-scroll"
                ref={chatScroll}
                tabIndex={0}
                aria-label="Historial del agente"
                onKeyDown={(e) => {
                  if (
                    [
                      "ArrowUp",
                      "ArrowDown",
                      "PageUp",
                      "PageDown",
                      "Home",
                      "End",
                    ].includes(e.key)
                  )
                    userScrollChat();
                }}
                onWheel={userScrollChat}
                onTouchStart={userScrollChat}
                onPointerDown={userScrollChat}
                onScroll={(e) => {
                  if (
                    autoScrolling.current ||
                    performance.now() < typingScrollUntil.current
                  )
                    return;
                  const el = e.currentTarget;
                  followChat.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 64;
                  if (followChat.current) setUnreadChat(false);
                }}
              >
                <ResearchEvidencePanel
                  workspace={w}
                  active={visible}
                  onContext={setEvidenceContext}
                  onSuggest={setPrompt}
                />
                <div
                  className="rw-chat"
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions"
                  aria-atomic="false"
                  aria-label="Conversación con el agente"
                >
                  {chat.length === 0 && (
                    <div>
                      <strong>AGENTE DE INVESTIGACIÓN</strong>
                      <p>
                        Describe la intervención que deseas explorar.
                        Revisaremos sus parámetros, supuestos y efectos antes de
                        aplicarla al experimento.
                      </p>
                    </div>
                  )}
                  {chat.length
                    ? chat.map((m) =>
                        m.report ? (
                          <ResearchLiveReport
                            key={m.id}
                            initial={m.report.initial}
                            createdAt={m.report.createdAt}
                            current={reportData}
                            onClose={() =>
                              setChat((s) =>
                                s.filter((entry) => entry.id !== m.id),
                              )
                            }
                          />
                        ) : (
                          <article
                            key={m.id}
                            data-role={m.role === "Tú" ? "user" : "assistant"}
                          >
                            <small>{m.role}</small>
                            {m.role === "Tú" ? (
                              <p>{m.text}</p>
                            ) : (
                              <AgentReplyText
                                text={m.text}
                                animate={typingMessageId === m.id}
                                onProgress={followTyping}
                                onComplete={() =>
                                  setTypingMessageId((id) =>
                                    id === m.id ? null : id,
                                  )
                                }
                              />
                            )}
                          </article>
                        ),
                      )
                    : null}
                </div>
                {busy && (
                  <p className="rw-chat-pending" role="status">
                    El agente está preparando su respuesta
                    <span className="rw-typing-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </p>
                )}
                {draft && (
                  <details className="rw-draft-drawer" key={draft.id}>
                    <summary>
                      Editar y confirmar: {draft.definition.name}
                    </summary>
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
                                    j === i
                                      ? { ...x, value: e.target.value }
                                      : x,
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
                                  numbers: draft.definition.numbers.map(
                                    (x, j) =>
                                      j === i
                                        ? {
                                            ...x,
                                            value: Number(e.target.value),
                                          }
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
                        {draft.definition.effects
                          .map((e) => e.channel)
                          .join(", ")}
                        . Horario uniforme aproximado; condición:{" "}
                        {draft.definition.thresholdKey ?? "ninguna"}. Corredores
                        exceptuados:{" "}
                        {draft.definition.excludedEdges.join(", ") || "ninguno"}
                        .
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
                                        definition: structuredClone(
                                          d.definition,
                                        ),
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
                          Parámetros inválidos: revisa rangos, calendario,
                          horario y referencias antes de confirmar.
                        </p>
                      )}
                    </section>
                  </details>
                )}
              </div>
              {unreadChat && (
                <button
                  className="rw-new-messages"
                  onClick={() => {
                    followChat.current = true;
                    autoScrolling.current = true;
                    chatScroll.current?.scrollTo({
                      top: chatScroll.current.scrollHeight,
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "instant"
                        : "smooth",
                    });
                    setUnreadChat(false);
                  }}
                >
                  Ver mensajes recientes ↓
                </button>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask();
                }}
                className="rw-composer"
              >
                <ResearchVoiceControls
                  active={visible && panelOpen && view === "measures"}
                  processing={busy}
                  onQuery={async (text, signal) => {
                    const result = await ask(text, signal, true);
                    if (!result)
                      throw Error(
                        "No se pudo completar la consulta de investigación.",
                      );
                    return JSON.stringify({
                      reply: result.reply,
                      proposal_ready: Boolean(result.proposal),
                      confirmed: false,
                      applied: false,
                    });
                  }}
                  getContext={() => agentContext}
                  onReport={() => {
                    const id = crypto.randomUUID(),
                      createdAt = new Date().toISOString();
                    followChat.current = true;
                    setChat((s) =>
                      [
                        ...s,
                        {
                          id,
                          role: "Reporte",
                          text: `Reporte del experimento generado para el día ${day}; datos del simulador, no evidencia clínica.`,
                          report: {
                            initial: structuredClone(reportData),
                            createdAt,
                          },
                        },
                      ].slice(-20),
                    );
                    return {
                      generated: true,
                      reportId: id,
                      observedDay: day,
                      executionPrepared: Boolean(manifest),
                      evidenceCurrent: agentContext.evidenceCurrent,
                      observed: agentContext.observed,
                      note: "Tarjeta de reporte abierta dentro del chat; se actualiza con el día observado. No se ejecutaron evaluaciones ni se confirmaron/aplicaron medidas.",
                    };
                  }}
                  onTranscript={(turn) => {
                    setTypingMessageId(null);
                    setChat((s) =>
                      s.some((m) => m.id === turn.id)
                        ? s
                        : [
                            ...s,
                            {
                              id: turn.id,
                              role:
                                turn.role === "user" ? "Tú" : "Agente de voz",
                              text: turn.text,
                            },
                          ].slice(-20),
                    );
                  }}
                />
                <textarea
                  aria-label="Petición al agente"
                  aria-describedby="rw-composer-hint"
                  maxLength={2000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing &&
                      e.keyCode !== 229
                    ) {
                      e.preventDefault();
                      if (!busy && prompt.trim())
                        e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Describe tu medida…"
                  required
                />
                <small id="rw-composer-hint">
                  Enter para enviar · Shift + Enter para una nueva línea
                </small>
                <button disabled={busy || !prompt.trim()} type="submit">
                  {busy ? "Consultando agente…" : "Enviar al agente"}
                </button>
              </form>
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
              <button disabled={!valid} onClick={begin}>
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
