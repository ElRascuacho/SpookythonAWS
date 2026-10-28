import { useEffect, useRef, useState } from "react";
import {
  Activity,
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
import { reportConsent } from "./reportConsent";
import { ResearchWelcome } from "./ResearchWelcome";
import { ResearchChart } from "./ResearchChart";
import {ResearchGuidedTour,type ResearchTourStep} from './ResearchGuidedTour';
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
import { applyAgentMeasure } from "../domain/agentMeasure";
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
  type MeasureEvaluation,
  type ResearchChartSpec,
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
const agentTools = [
  { id: "measure", label: "Medidas", detail: "Crea o edita una intervención declarativa, la activa y prepara una simulación local si el escenario es válido." },
  { id: "evaluation", label: "Pre-evaluar", detail: "Estima impacto, costo, viabilidad presupuestaria y alivio hospitalario con el motor SEIR-V local." },
  { id: "charts", label: "Gráficos", detail: "Prepara curvas SEIR, carga por zona e impacto de medida solo con datos validados del experimento." },
  { id: "analysis", label: "Analizar", detail: "Interpreta telemetría observada, evidencia comparativa y resultados del Comité sin inventar datos clínicos." },
  { id: "reports", label: "Reportes", detail: "Envía el reporte vivo y todos los gráficos disponibles del experimento dentro del chat." },
] as const;
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
      evaluation?: MeasureEvaluation | null;
      charts?: ResearchChartSpec[];
      liveChartsIdentity?: string;
      playbackOffer?: boolean;
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
  const [tourStep,setTourStep]=useState<ResearchTourStep|null>(null);
  type PanelSize = "small" | "half" | "full";
  const [panelSize, setPanelSize] = useState<PanelSize>("small");
  const tourBackup=useRef<{view:typeof view;panelOpen:boolean;panelSize:PanelSize;inspecting:boolean;curveOpen:boolean;fileOpen:boolean;prompt:string;running:boolean}|null>(null);
  const [tourNotice,setTourNotice]=useState('');
  function startTour(){
    if(busy||tourStep!==null)return;
    tourBackup.current={view,panelOpen,panelSize,inspecting,curveOpen,fileOpen,prompt,running};
    setRunning(false);setPanelSize("small");setInspecting(false);setCurveOpen(false);setFileOpen(false);setTourNotice('');setTourStep(0);
  }
  function endTour(completed=false){
    const saved=tourBackup.current;if(!saved)return;tourBackup.current=null;setTourStep(null);
    setView(saved.view);setPanelOpen(saved.panelOpen);setPanelSize(saved.panelSize);setInspecting(saved.inspecting);setCurveOpen(saved.curveOpen);setFileOpen(saved.fileOpen);setPrompt(saved.prompt);setRunning(visible&&saved.running);
    if(completed){try{localStorage.setItem('manta-cero:research-tour:completed:v1','1');}catch{/* Completion need not depend on storage. */}}
    setTourNotice(completed?'Recorrido completado. Tu experimento no se ha modificado.':'Recorrido cerrado sin marcar como completado.');
  }
  useEffect(()=>{if(!visible)endTour();},[visible]);
  useEffect(()=>{if(!tourNotice)return;const timer=setTimeout(()=>setTourNotice(''),5000);return()=>clearTimeout(timer);},[tourNotice]);
  const [inspecting, setInspecting] = useState(false);
  const [curveOpen, setCurveOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [rawParams, setRawParams] = useState<Record<string, string>>({});
  const [toolsOpen, setToolsOpen] = useState(false);
  const [focusedTool, setFocusedTool] = useState<(typeof agentTools)[number]["id"] | null>(null);
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
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar.");
      return false;
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
      if(tourStep===5)endTour(true);
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
    if (tourStep!==null || busy || !(voiceMessage ?? prompt).trim()) return;
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
    if (!voiceTool && (focusedTool === "reports" || reportConsent(message, false))) {
      const published = publishAllAvailableReports();
      const reply = "Listo: envié todos los reportes disponibles en el chat.";
      if (voiceTool) return { reply, proposal: null, model: "Trinity", report: published };
      return { reply, proposal: null, model: "Trinity", report: published };
    }
    setBusy(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 27000);
    const signal = voiceSignal
      ? AbortSignal.any([controller.signal, voiceSignal])
      : controller.signal;
    try {
      const snapshot = result?.timeline?.[day];
      let epidemicContext = undefined;
      if (snapshot) {
        const activeInfected = snapshot.totalI;
        const cumulativeInfected = snapshot.cumulativeInfected;
        const totalBudget = (w.params.dailyBudget ?? 1000) * (w.params.days ?? 60);
        const budgetSpent =
          result?.timeline
            ?.slice(0, day + 1)
            .reduce((acc, s) => acc + (s.action?.budgetSpent ?? 0), 0) ?? 0;
        const budgetRemaining = Math.max(0, totalBudget - budgetSpent);
        const capacity = w.params.hospitalCapacity || 1200;
        const hospitalSaturationPercent = Number(
          Math.min(100, (activeInfected / capacity) * 100).toFixed(1),
        );
        const topActiveNodes = Object.entries(snapshot.nodes)
          .sort((a, b) => b[1].I - a[1].I)
          .slice(0, 3)
          .map(([id, n]) => {
            const totalPop = n.S + n.E + n.I + n.R;
            const prevalence =
              totalPop > 0 ? Number((n.I / totalPop).toFixed(4)) : 0;
            const name = MANTA_NODES.find((node) => node.id === id)?.name ?? id;
            return { id, name, infected: n.I, prevalence };
          });
        epidemicContext = {
          day,
          activeInfected,
          cumulativeInfected,
          budgetRemaining,
          hospitalSaturationPercent,
          topActiveNodes,
        };
      }

      const chartContext = {
        observedDays: (result?.timeline ?? []).slice(0, day + 1).map((s) => ({
          day: s.day,
          activeInfected: s.totalI,
          exposed: s.totalE,
          recovered: s.totalR,
          cumulativeInfected: s.cumulativeInfected,
          hospitalCollapsed: s.hospitalCollapsed,
        })),
        zones: snapshot
          ? Object.entries(snapshot.nodes).map(([id, n]) => {
              const totalPop = n.S + n.E + n.I + n.R;
              return {
                id,
                name: MANTA_NODES.find((node) => node.id === id)?.name ?? id,
                infected: n.I,
                exposed: n.E,
                recovered: n.R,
                prevalence: totalPop > 0 ? Number((n.I / totalPop).toFixed(4)) : 0,
              };
            })
          : [],
      };
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
          epidemicContext,
          chartContext,
          ...(voiceTool ? { focusTool: "measure" } : focusedTool ? { focusTool: focusedTool } : {}),
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
      if (!voiceTool || parsed.proposal || parsed.charts?.length)
        setChat((s) =>
          [
            ...s,
            {
              id: replyId,
              role: "Trinity",
              text: parsed.reply,
              evaluation: parsed.evaluation,
              charts: parsed.charts,
            },
          ].slice(-20),
        );
      if (parsed.proposal) {
        const id = target ?? crypto.randomUUID();
        const next = applyAgentMeasure(w, parsed.proposal, id, target);
        // Preserve other unconfirmed drafts rather than silently omitting them.
        const runnable = next.drafts.every((d) => !d.enabled || (d.confirmed && d.confirmedRevision === d.revision));
        let simulation: SingleSimulationRunResult | null = null;
        if (runnable) {
          try {
            const measures = next.drafts.filter((d) => d.enabled).map((d) => ({ id: d.id, definition: d.confirmed! }));
            simulation = runSingleSeirSimulation(next.params, next.strategy, 0, undefined, undefined,
              measures.length ? { resolveDailyEffects: (day, state, budget) => resolveResearchEffects(day, state, budget, measures) } : undefined);
          } catch {
            // Keep the validated active measure even if a local execution cannot start.
          }
        }
        setW(next);
        setDraftId(id);
        if (simulation) {
          setManifest(structuredClone(next));
          setResult(simulation);
          setDay(0);
          setRunning(true);
        }
        const status = simulation
          ? "Medida creada, activada y simulación local iniciada desde el día 0. Puedes pausarla o editar la medida."
          : "Medida creada y activada. No se inició simulación: revisa las otras medidas pendientes o los parámetros del escenario.";
        setChat((entries) => entries.map((entry) => entry.id === replyId ? { ...entry, text: `${entry.text}\n${status}` } : entry));
        return { ...parsed, confirmed: true, applied: true, simulation_started: Boolean(simulation), reply: `${parsed.reply} ${status}` };
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
  function availableReportCharts(): ResearchChartSpec[] {
    const curve: ResearchChartSpec = {
      type: "line",
      title: "Reporte gráfico · evolución SEIR",
      subtitle: "Datos observados del playback actual hasta el día seleccionado.",
      xLabel: "Día",
      yLabel: "Personas",
      unit: "people",
      source: "Simulador SEIR-V local",
      series: [
        { name: "Infectados activos", color: "#ff6b6b", points: observed.map((s) => ({ x: s.day, y: s.totalI })) },
        { name: "Expuestos", color: "#ffd166", points: observed.map((s) => ({ x: s.day, y: s.totalE })) },
        { name: "Recuperados", color: "#8bd8bd", points: observed.map((s) => ({ x: s.day, y: s.totalR })) },
        { name: "Acumuladas", color: "#7aa2ff", points: observed.map((s) => ({ x: s.day, y: s.cumulativeInfected })) },
      ],
    };
    const zones = Object.entries(snapshot.nodes)
      .sort((a, b) => b[1].I - a[1].I)
      .slice(0, 8);
    const burden: ResearchChartSpec = {
      type: "bar",
      title: "Reporte gráfico · focos por zona",
      subtitle: "Zonas con mayor carga activa en el día observado.",
      xLabel: "Zona",
      yLabel: "Infectados activos",
      unit: "people",
      source: "Instantánea validada del simulador local",
      series: [
        {
          name: "Activos",
          color: "#ffad66",
          points: zones.map(([id, n]) => {
            const totalPop = n.S + n.E + n.I + n.R;
            const prevalence = totalPop > 0 ? (n.I / totalPop) * 100 : 0;
            return { x: id, y: n.I, label: `${NODE_MAP[id]?.name ?? id} · ${prevalence.toFixed(1)}%` };
          }),
        },
      ],
    };
    const latestEvaluation = [...chat].reverse().find((m) => m.evaluation)?.evaluation;
    const impact: ResearchChartSpec[] = latestEvaluation ? [{
      type: "bar",
      title: "Reporte gráfico · impacto de la última medida evaluada",
      subtitle: "Pre-evaluación determinística; hipótesis no calibrada.",
      xLabel: "Métrica",
      yLabel: "Valor",
      unit: "count",
      source: "Motor SEIR-V local / researchEvaluation",
      series: [{
        name: "Resultado",
        color: "#8bd8bd",
        points: [
          { x: "Pico base", y: latestEvaluation.baselinePeakInfected },
          { x: "Pico simulado", y: latestEvaluation.simulatedPeakInfected },
          { x: "Infecciones evitadas", y: latestEvaluation.infectionsAvoided },
          { x: "Reducción pico %", y: Number(latestEvaluation.peakReductionPercent.toFixed(2)) },
        ],
      }],
    }] : [];
    return [curve, burden, ...impact];
  }
  function publishAllAvailableReports() {
    const id = crypto.randomUUID();
    const chartId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const charts = availableReportCharts();
    followChat.current = true;
    setChat((s) => [
      ...s,
      {
        id,
        role: "Reporte",
        text: `Reporte vivo del experimento generado para el día ${day}; datos del simulador, no evidencia clínica.`,
        report: { initial: structuredClone(reportData), createdAt },
      },
      {
        id: chartId,
        role: "Trinity",
        text: `Envié todos los reportes disponibles: reporte vivo, evolución SEIR y focos por zona${charts.length > 2 ? ", más impacto de la última medida evaluada" : ""}. ¿Quieres reproducir la simulación desde el día 0 hasta el día final? El mapa y estos gráficos seguirán cada día.`,
        charts,
        liveChartsIdentity: reportData.identity,
        playbackOffer: true,
      },
    ].slice(-20));
    return {
      generated: true,
      reportIds: [id, chartId],
      reports: charts.map((chart) => chart.title),
      observedDay: day,
      executionPrepared: Boolean(manifest),
      evidenceCurrent: agentContext.evidenceCurrent,
      observed: agentContext.observed,
      note: "Se abrieron todos los reportes disponibles dentro del chat. No se ejecutaron evaluaciones nuevas ni se confirmaron/aplicaron medidas.",
    };
  }
  const max = Math.max(0, ...observed.map((s) => s.totalI));
  const curve = { width: 640, height: 220, left: 52, right: 18, top: 18, bottom: 38 };
  const curvePlotWidth = curve.width - curve.left - curve.right;
  const curvePlotHeight = curve.height - curve.top - curve.bottom;
  const curveMax = Math.max(10, Math.ceil(max / 10) * 10);
  const curveX = (index: number) =>
    curve.left + (observed.length <= 1 ? 0 : (index / (observed.length - 1)) * curvePlotWidth);
  const curveY = (value: number) => curve.top + (1 - value / curveMax) * curvePlotHeight;
  const curvePoints = observed.map((s, index) => `${curveX(index)},${curveY(s.totalI)}`).join(" ");
  const curveArea = observed.length
    ? `${curve.left},${curve.height - curve.bottom} ${curvePoints} ${curveX(observed.length - 1)},${curve.height - curve.bottom}`
    : "";
  const curveTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    value: Math.round(curveMax * ratio),
    y: curveY(curveMax * ratio),
  }));
  const curveDayTicks = Array.from(new Set([0, Math.floor(day / 2), day])).filter(
    (value) => value >= 0 && value < observed.length,
  );
  return (
    <section
      className={`research-workspace ${visible ? "is-active" : ""} ${panelOpen ? "rw-panel-open" : ""} rw-panel-${panelSize}`}
      inert={!visible}
      aria-hidden={!visible}
      aria-label="Espacio de investigación"
      tabIndex={-1}
    >
      <ResearchWelcome active={visible} openRequest={welcomeRequest} onStartTour={busy?undefined:startTour} />
      <ResearchGuidedTour step={visible?tourStep:null} onCancel={()=>endTour()} />
      {tourNotice&&<p className="rw-tour-notice" role="status">{tourNotice}</p>}
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
            data-research-tour="agent"
            aria-pressed={panelOpen && view === "measures"}
            onClick={() => {
              setPanelOpen(true);
              setInspecting(false);
              setCurveOpen(false);
              setView("measures");
              if(tourStep===1)setTourStep(2);
            }}
          >
            <MessageSquare size={16} />
            <span>Agente</span>
          </button>
          <button
            aria-label="Configurar escenario"
            data-research-tour="scenario"
            aria-pressed={panelOpen && view === "scenario"}
            onClick={() => {
              setPanelOpen(true);
              setInspecting(false);
              setCurveOpen(false);
              setView("scenario");
              if(tourStep===0)setTourStep(1);
            }}
          >
            <Settings2 size={16} />
            <span>Escenario</span>
          </button>
          <button
            aria-label="Evolución del experimento"
            data-research-tour="evolution"
            aria-pressed={curveOpen}
            onClick={() => {
              if (window.matchMedia("(max-width: 720px)").matches)
                setPanelOpen(false);
              setCurveOpen((v) => tourStep===3?true:!v);
              if(tourStep===3)setTourStep(4);
            }}
          >
            <ChartNoAxesCombined size={16} />
            <span>Evolución</span>
          </button>
          <button
            aria-label="Archivo del experimento"
            data-research-tour="file"
            aria-expanded={fileOpen}
            onClick={() => {setFileOpen((v) => tourStep===4?true:!v);if(tourStep===4)setTourStep(5);}}
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
          <button data-research-tour="export" onClick={download}>Exportar</button>
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
            <div className="rw-panel-actions" aria-label="Tamaño de ventana">
              <button
                aria-label="Usar ventana pequeña"
                title="Pequeña"
                aria-pressed={panelSize === "small"}
                onClick={() => setPanelSize("small")}
              >
                <Minimize2 size={16} />
                <span>Pequeña</span>
              </button>
              <button
                aria-label="Usar media pantalla"
                title="Media pantalla"
                aria-pressed={panelSize === "half"}
                onClick={() => setPanelSize("half")}
              >
                1/2
              </button>
              <button
                aria-label="Usar pantalla completa"
                title="Pantalla completa"
                aria-pressed={panelSize === "full"}
                onClick={() => setPanelSize("full")}
              >
                <Maximize2 size={16} />
                <span>Completa</span>
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
                        Describe la intervención que deseas explorar. Trinity la validará, activará y simulará localmente; podrás editarla o desactivarla después.
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
                              <>
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
                                {m.liveChartsIdentity && <small>{m.liveChartsIdentity === reportData.identity && !stale ? `En vivo · día ${day}` : "Instantánea: la configuración cambió"}</small>}
                                {(m.liveChartsIdentity === reportData.identity && !stale ? availableReportCharts() : m.charts)?.map((chart, index) => (
                                  <ResearchChart
                                    key={`${m.id}-chart-${index}`}
                                    chart={chart}
                                  />
                                ))}
                                {m.playbackOffer && (
                                  <div className="rw-report-playback-offer">
                                    <button type="button" disabled={busy || tourStep !== null || m.liveChartsIdentity !== reportData.identity} onClick={() => {
                                      if (begin()) {
                                        setRunning(true);
                                        setCurveOpen(true);
                                        setChat((entries) => entries.map((entry) => entry.id === m.id ? { ...entry, playbackOffer: false } : entry));
                                      }
                                    }}>Simular del día 0 al {w.params.days}</button>
                                    <p>Usa solo medidas confirmadas. Puedes pausar o cambiar de día con los controles del mapa.</p>
                                  </div>
                                )}
                              </>
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
                  active={visible && panelOpen && view === "measures" && tourStep===null}
                  processing={busy}
                  toolsSlot={
                    <>
                    <button
                      type="button"
                      className="rw-tools-button"
                      aria-expanded={toolsOpen}
                      aria-controls="rw-agent-tools"
                      onClick={() => setToolsOpen((open) => !open)}
                    >
                      <Settings2 size={15} /> Tools
                    </button>
                    <button type="button" disabled={busy || tourStep !== null || !valid} onClick={() => publishAllAvailableReports()}>
                      <ChartNoAxesCombined size={15} /> Generar reporte
                    </button>
                    </>
                  }
                  onQuery={async (text, signal) => {
                    const result = await ask(text, signal, true);
                    if (!result)
                      throw Error(
                        "No se pudo completar la consulta de investigación.",
                      );
                    return JSON.stringify({
                      reply: result.reply,
                      proposal_ready: Boolean(result.proposal),
                      confirmed: Boolean("confirmed" in result && result.confirmed),
                      applied: Boolean("applied" in result && result.applied),
                      simulation_started: Boolean("simulation_started" in result && result.simulation_started),
                    });
                  }}
                  getContext={() => ({
                    ...agentContext,
                    ...(focusedTool ? { focusTool: focusedTool } : {}),
                  })}
                  onReport={publishAllAvailableReports}
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
                                turn.role === "user" ? "Tú" : "Trinity",
                              text: turn.text,
                            },
                          ].slice(-20),
                    );
                  }}
                />
                {toolsOpen && (
                  <section
                    id="rw-agent-tools"
                    className="rw-agent-tools"
                    aria-label="Herramientas de Trinity"
                  >
                    <strong>Selecciona el foco de Trinity</strong>
                    <div className="rw-tool-list" role="listbox" aria-label="Herramientas disponibles">
                      <button
                        type="button"
                        role="option"
                        aria-selected={focusedTool === null}
                        className={focusedTool === null ? "is-selected" : ""}
                        onClick={() => setFocusedTool(null)}
                      >
                        <b>Automático</b>
                        <span>La agente decide el foco desde tu mensaje.</span>
                      </button>
                      {agentTools.map((tool) => (
                        <button
                          key={tool.id}
                          type="button"
                          role="option"
                          aria-selected={focusedTool === tool.id}
                          className={focusedTool === tool.id ? "is-selected" : ""}
                          onClick={() => setFocusedTool(tool.id)}
                        >
                          <b>{tool.label}</b>
                          <span>{tool.detail}</span>
                        </button>
                      ))}
                    </div>
                    <p>
                      Al seleccionar una herramienta, Trinity la prioriza por texto y voz; puede usar otra capacidad cuando sea necesaria para completar tu tarea.
                    </p>
                  </section>
                )}
                <textarea
                  aria-label="Petición al agente"
                  data-research-tour="prompt"
                  aria-describedby="rw-composer-hint"
                  maxLength={2000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onClick={() => {
                    // Driver focuses this field automatically; only a deliberate click advances.
                    if (tourStep === 2) setTourStep(3);
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing &&
                      e.keyCode !== 229
                    ) {
                      e.preventDefault();
                      if(tourStep!==null){if(tourStep===2)setTourStep(3);return;}
                      if (!busy && prompt.trim())
                        e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Describe tu medida…"
                  required
                />
                <small id="rw-composer-hint">
                  {tourStep===2?'Recorrido: haz clic en este cuadro o pulsa Enter para continuar. No se enviará a la IA.':tourStep!==null?'Recorrido activo: no se enviarán consultas a la IA.':'Enter para enviar · Shift + Enter para una nueva línea'}
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
            aria-label="Evolución observada del experimento"
          >
            <button
              className="rw-close"
              aria-label="Cerrar evolución"
              onClick={() => setCurveOpen(false)}
            >
              <X size={16} />
            </button>
            <header className="rw-curve-header">
              <div>
                <h2>Evolución observada</h2>
                <span>Infecciosos activos · día {day}</span>
              </div>
              <strong>{snapshot.totalI.toLocaleString("es-EC")}</strong>
            </header>
            <svg
              viewBox={`0 0 ${curve.width} ${curve.height}`}
              role="img"
              aria-label={`Trayectoria observada: ${snapshot.totalI.toLocaleString("es-EC")} infecciosos activos en el día ${day}`}
            >
              <defs>
                <linearGradient id="rw-curve-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#b1dfc8" stopOpacity=".34" />
                  <stop offset="100%" stopColor="#b1dfc8" stopOpacity="0" />
                </linearGradient>
              </defs>
              {curveTicks.map((tick) => (
                <g key={tick.value} className="rw-curve-grid">
                  <line x1={curve.left} x2={curve.width - curve.right} y1={tick.y} y2={tick.y} />
                  <text x={curve.left - 8} y={tick.y + 4} textAnchor="end">{tick.value.toLocaleString("es-EC")}</text>
                </g>
              ))}
              <line className="rw-curve-axis" x1={curve.left} x2={curve.left} y1={curve.top} y2={curve.height - curve.bottom} />
              <line className="rw-curve-axis" x1={curve.left} x2={curve.width - curve.right} y1={curve.height - curve.bottom} y2={curve.height - curve.bottom} />
              {curveArea && <polygon points={curveArea} fill="url(#rw-curve-fill)" />}
              <polyline points={curvePoints} fill="none" stroke="#b1dfc8" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {observed.map((s, index) => (
                <circle key={s.day} cx={curveX(index)} cy={curveY(s.totalI)} r={index === observed.length - 1 ? 5 : 2.5} className={index === observed.length - 1 ? "rw-curve-current" : "rw-curve-point"}>
                  <title>Día {s.day}: {s.totalI.toLocaleString("es-EC")} infecciosos activos</title>
                </circle>
              ))}
              {curveDayTicks.map((index) => (
                <text key={index} className="rw-curve-day" x={curveX(index)} y={curve.height - 13} textAnchor="middle">Día {observed[index].day}</text>
              ))}
            </svg>
            <p>
              Solo días observados: 0–{day} · pico observado {max.toLocaleString("es-EC")} personas · {manifest
                ? `semilla ${manifest.params.seed} · política ${manifest.strategy}`
                : "sin ejecución configurada"}.
            </p>
          </section>
        </main>
      </div>
    </section>
  );
}
