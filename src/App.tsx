import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CircleHelp,
  Dna,
  FlaskConical,
  HeartPulse,
  House,
  LogOut,
  Clapperboard,
  MapPin,
  Microscope,
  RotateCcw,
  Settings2,
  ShieldCheck,
  ShieldPlus,
  HandHeart,
  SprayCan,
  TrendingDown,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { CureCityMap } from "./components/CureCityMap";
import { CureEarth3DMap, type MapStyleMode } from "./components/CureEarth3DMap";
import { ComparisonChart } from "./components/ComparisonChart";
import {
  DAY_TRANSITION_MS,
  DayTransition,
  type DayTransitionReport,
} from "./components/DayTransition";
import { NewsFlash } from "./components/NewsFlash";
import { GameTutorial } from "./components/GameTutorial";
import { LabSpontaneousEvent } from "./components/LabSpontaneousEvent";
import { SimulationDashboard } from "./components/SimulationDashboard";
import { StrategyReport } from "./components/StrategyReport";
import { createLabEvent, type LabEvent } from "./domain/spontaneousEvents";
import { TUTORIAL_SEEN_KEY } from "./domain/tutorial";
import {
  advanceDay,
  createGame,
  getPlanCost,
  INTERVENTIONS,
  LOSS_THRESHOLD,
  MAX_DAYS,
  RESEARCH_LEVELS,
  type CureGame,
  type GameConfig,
  type Intervention,
  type Order,
  type ResearchFunding,
} from "./domain/cureGame";
import { BUDGET_LEVELS } from "./domain/economy";
import { CHAPTERS, campaignReadout, type CampaignChapter } from "./domain/campaign";
import {
  MANTA_NODES,
  NODE_MAP,
  TOTAL_MANTA_POPULATION,
} from "./domain/mantaGraph";
import { computePercentile, runMonteCarloComparison } from "./domain/monteCarlo";
import { requestNews } from "./domain/newsClient";
import type { GameNews, NewsState } from "./domain/newsModel";
import { runSingleSeirSimulation } from "./domain/seirEngine";
import type { MonteCarloComparisonResult } from "./domain/types";

const DEFAULT_CONFIG: GameConfig = {
  seed: 20261030,
  scenario: "standard",
  patientZeroId: "N01",
  dailyBudget: BUDGET_LEVELS[1],
  vaccineBatchSize: 850,
};
const format = (value: number) => value.toLocaleString("es-EC");
const ICONS: Record<Intervention, LucideIcon> = {
  vaccine: ShieldPlus,
  fumigate: SprayCan,
  cordon: ShieldCheck,
  isolation: House,
  prevention: HandHeart,
};
const PHASES = [
  "Secuenciación del patógeno",
  "Desarrollo del antídoto",
  "Validación de la cura",
];
const BUDGET_LABELS: Record<number, string> = {
  4000: "Austeridad municipal",
  7500: "Emergencia municipal",
  11000: "Refuerzo COE Nacional",
};
const FUNDING_LABELS: Record<number, string> = {
  0: "Pausar",
  1200: "Estándar",
  2200: "Prioridad",
};
type Modal = "help" | "settings" | "analysis" | "result" | "logout" | "zone" | "campaign" | "event" | null;
interface Evaluation {
  comparison: MonteCarloComparisonResult;
  playerMean: number;
  playerP10: number;
  playerP90: number;
}

const researchGainFor = (funding: ResearchFunding) =>
  funding === RESEARCH_LEVELS[2] ? 5 : funding === RESEARCH_LEVELS[1] ? 3 : 0;

const describeNewsFacts = (state: NewsState) =>
  `+${format(state.newCases)} contagios · ${format(state.cumulativeInfected)} acumulados · cura ${state.research}% · $${format(state.budgetSpent)} ejecutados · hospital ${state.hospitalLoadPct}%`;

function buildNewsState(
  previous: CureGame,
  next: CureGame,
  orders: Order[],
  funding: ResearchFunding,
): NewsState {
  const before = previous.timeline[previous.day];
  const after = next.timeline[next.day];
  const newCases = after.cumulativeInfected - before.cumulativeInfected;
  return {
    day: next.day,
    totalDays: next.params.days,
    status: next.status,
    scenario: next.config.scenario,
    seed: next.config.seed,
    dailyBudget: next.params.dailyBudget,
    budgetSpent: getPlanCost(orders, funding),
    funding,
    research: next.research,
    researchGain: next.research - previous.research,
    newCases,
    cumulativeInfected: after.cumulativeInfected,
    activeInfections: after.totalI,
    infectionsGrowthPct:
      before.cumulativeInfected > 0
        ? Number((newCases / before.cumulativeInfected) * 100) || 0
        : 0,
    hospitalLoadPct: Math.round(
      (after.totalI / next.params.hospitalCapacity) * 100,
    ),
    decisions: {
      vaccine: orders.filter((order) => order.kind === "vaccine").length,
      fumigate: orders.filter((order) => order.kind === "fumigate").length,
      cordon: orders.filter((order) => order.kind === "cordon").length,
      isolation: orders.filter((order) => order.kind === "isolation").length,
      prevention: orders.filter((order) => order.kind === "prevention").length,
    },
    zonesAffected: Object.values(after.nodes).filter((zone) => zone.I > 0)
      .length,
    zonesTotal: MANTA_NODES.length,
  };
}

function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", keyboard);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`game-dialog ${wide ? "wide" : ""}`}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">OPERACIÓN MANTA CERO</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar ventana"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App({
  onLogout,
  loggingOut = false,
}: {
  onLogout?: () => void;
  loggingOut?: boolean;
} = {}) {
  const [game, setGame] = useState(() => createGame(DEFAULT_CONFIG));
  const [simulationMode, setSimulationMode] = useState(false);
  const [selectedNode, setSelectedNode] = useState("N01");
  const [orders, setOrders] = useState<Order[]>([]);
  const [eventBonus, setEventBonus] = useState<Order | null>(null);
  const [activeEvent, setActiveEvent] = useState<LabEvent | null>(null);
  const [funding, setFunding] = useState<ResearchFunding>(RESEARCH_LEVELS[1]);
  const [modal, setModal] = useState<Modal>(() => {
    try {
      return localStorage.getItem(TUTORIAL_SEEN_KEY) === "1" ? null : "help";
    } catch {
      return "help";
    }
  });
  const [briefingChapter, setBriefingChapter] = useState<CampaignChapter>(0);
  const [draft, setDraft] = useState<GameConfig>(DEFAULT_CONFIG);
  const [notice, setNotice] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [analysisDay, setAnalysisDay] = useState(0);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [mapView, setMapView] = useState<"3d" | "2d">("3d");
  const [styleMode, setStyleMode] = useState<MapStyleMode>("tactical3d");
  const [dayTransition, setDayTransition] =
    useState<DayTransitionReport | null>(null);
  const [news, setNews] = useState<GameNews | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsFacts, setNewsFacts] = useState("");
  const transitionTimer = useRef<number | null>(null);
  const advancing = useRef(false);
  const newsRequestId = useRef(0);
  useEffect(
    () => () => {
      if (transitionTimer.current !== null)
        window.clearTimeout(transitionTimer.current);
    },
    [],
  );
  const closeModal = () => {
    if (modal === "event") setActiveEvent(null);
    if (modal === "help") {
      try {
        localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
      } catch {
        // Storage can be blocked; dismissing the tutorial must still work.
      }
    }
    setModal(null);
  };
  const snapshot = game.timeline[game.day];
  const node = NODE_MAP[selectedNode];
  const local = snapshot.nodes[selectedNode];
  const remaining = game.params.dailyBudget - getPlanCost(orders, funding);
  const newCases =
    snapshot.cumulativeInfected -
    game.timeline[Math.max(0, game.day - 1)].cumulativeInfected;
  const hospitalLoad = Math.round(
    (snapshot.totalI / game.params.hospitalCapacity) * 100,
  );
  const stage = game.research < 25 ? 0 : game.research < 65 ? 1 : 2;
  const researchGain = researchGainFor(funding);
  const playing = game.status === "playing";
  const chapterId = game.config.campaignChapter;
  const chapter = chapterId === undefined ? null : CHAPTERS[chapterId];

  const selectZone = (id: string) => {
    setSelectedNode(id);
    setModal("zone");
  };

  const queueOrder = (kind: Intervention) => {
    setOrders((current) => [...current, { nodeId: selectedNode, kind }]);
    setNotice(
      `${INTERVENTIONS[kind].label} asignada a ${node.name}. Se ejecutará al avanzar el día.`,
    );
  };
  const closeNews = () => {
    newsRequestId.current += 1;
    setNews(null);
    setNewsLoading(false);
  };
  const startNews = (state: NewsState) => {
    const requestId = ++newsRequestId.current;
    setNews(null);
    setNewsFacts(describeNewsFacts(state));
    setNewsLoading(true);
    requestNews(state).then((result) => {
      if (newsRequestId.current !== requestId) return;
      setNews(result);
      setNewsLoading(false);
    });
  };
  const nextDay = () => {
    if (advancing.current) return;
    try {
      const next = advanceDay(game, orders, funding, eventBonus ?? undefined);
      const report: DayTransitionReport = {
        day: next.day,
        totalDays: next.params.days,
        research: next.research,
        newCases:
          next.timeline[next.day].cumulativeInfected -
          game.timeline[game.day].cumulativeInfected,
        brigades: orders.length + (eventBonus && !orders.some((o) => o.nodeId === eventBonus.nodeId && o.kind === "prevention") ? 1 : 0),
        funding,
        status: next.status,
      };
      if (chapterId !== undefined) {
        newsRequestId.current++;
        setNewsLoading(false);
        setNewsFacts(campaignReadout(chapterId, next.timeline[next.day], next.research));
        setNews({
          headline: next.status === "won" ? "Objetivo cumplido" : next.status === "lost" ? "Operación interrumpida" : CHAPTERS[chapterId].title,
          body: next.status === "won" ? CHAPTERS[chapterId].victory : next.status === "lost" ? "No se alcanzó el objetivo. Revisa los datos y adapta tu plan." : `Día ${next.day}/${next.params.days}. ${campaignReadout(chapterId, next.timeline[next.day], next.research)}. ${CHAPTERS[chapterId].objective}`,
          severity: next.status === "won" ? "victory" : next.status === "lost" ? "critical" : "alert",
          source: "fallback",
        });
      } else startNews(buildNewsState(game, next, orders, funding));
      setGame(next);
      setOrders([]);
      setEventBonus(null);
      setEvaluation(null);
      setNotice(`Día ${next.day}: ${next.log[0]}`);
      const finishTurn = () => {
        advancing.current = false;
        transitionTimer.current = null;
        setDayTransition(null);
        if (next.status !== "playing") setModal("result");
        else {
          const incident = createLabEvent(next.config.seed, next.day);
          if (incident) { setActiveEvent(incident); setModal("event"); }
        }
      };
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        finishTurn();
        return;
      }
      advancing.current = true;
      setDayTransition(report);
      transitionTimer.current = window.setTimeout(
        finishTurn,
        DAY_TRANSITION_MS,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo avanzar.");
    }
  };
  const newGame = (config: GameConfig = draft) => {
    try {
      if (transitionTimer.current !== null) {
        window.clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
      }
      advancing.current = false;
      setDayTransition(null);
      newsRequestId.current += 1;
      setNews(null);
      setNewsFacts("");
      setNewsLoading(false);
      setGame(createGame(config));
      setSelectedNode(config.patientZeroId);
      setOrders([]);
      setEventBonus(null);
      setActiveEvent(null);
      setFunding(RESEARCH_LEVELS[1]);
      setEvaluation(null);
      setNotice("Nueva misión iniciada.");
      setModal(null);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Configuración inválida.",
      );
    }
  };
  const openAnalysis = () => {
    setAnalysisDay(game.day);
    setModal("analysis");
    if (evaluation) return;
    setIsEvaluating(true);
    // Paint the dialog before the small, explicitly requested local Monte Carlo batch.
    window.setTimeout(() => {
      try {
        const params = { ...game.params, days: game.day, monteCarloRuns: 20 };
        const comparison = runMonteCarloComparison(params);
        const totals = Array.from(
          { length: 20 },
          (_, index) =>
            runSingleSeirSimulation(
              params,
              "SMART_CORTAFUEGOS",
              index,
              game.actions,
            ).totalCumulativeInfected,
        ).sort((a, b) => a - b);
        setEvaluation({
          comparison,
          playerMean: Math.round(
            totals.reduce((sum, value) => sum + value, 0) / totals.length,
          ),
          playerP10: computePercentile(totals, 10),
          playerP90: computePercentile(totals, 90),
        });
      } catch {
        setNotice("No se pudo calcular la comparación. Vuelve a intentarlo.");
      } finally {
        setIsEvaluating(false);
      }
    }, 60);
  };
  const openSettings = () => {
    setDraft({ ...game.config, campaignChapter: undefined });
    setModal("settings");
  };

  if (simulationMode) return <SimulationDashboard game={game} onBack={() => setSimulationMode(false)} />;

  return (
    <div className="game-shell">
      <header className="hub-topbar">
        <a className="brand" href="#" aria-label="Operación Manta Cero">
          <span className="brand-mark">
            <Dna size={26} />
          </span>
          <span>
            MANTA<span className="brand-zero">CERO</span>
            <small>LA CURA ESTÁ EN TUS MANOS</small>
          </span>
        </a>
        <div className="mission-badge">
          <span className="live-dot" />
          OPERACIÓN NECRO-DENGUE <span className="badge-divider">/</span>
          <b>DEMO JUGABLE</b>
        </div>
        <nav className="header-actions" aria-label="Opciones de misión">
          <button aria-label="Modo simulación múltiple" disabled={dayTransition !== null} onClick={() => setSimulationMode(true)}>
            <Activity size={16} /><span>Simulación</span>
          </button>
          <button aria-label="Campaña cinematográfica" onClick={() => { setBriefingChapter(0); setModal("campaign"); }}>
            <Clapperboard size={16} />
            <span>Campaña</span>
          </button>
          <button aria-label="Evaluar mi estrategia" onClick={openAnalysis}>
            <TrendingDown size={16} />
            <span>Evaluar</span>
          </button>
          <button aria-label="Cómo jugar" onClick={() => setModal("help")}>
            <CircleHelp size={16} />
            <span>Cómo jugar</span>
          </button>
          <button aria-label="Nueva misión" onClick={openSettings}>
            <Settings2 size={16} />
            <span>Nueva misión</span>
          </button>
          {onLogout && (
            <button
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              onClick={() => setModal("logout")}
              disabled={loggingOut}
            >
              <LogOut size={16} />
              <span>{loggingOut ? "Saliendo…" : "Salir"}</span>
            </button>
          )}
        </nav>
      </header>

      <main className="map-stage">
        {mapView === "3d" ? (
          <CureEarth3DMap
            snapshot={snapshot}
            selectedNode={selectedNode}
            onSelect={selectZone}
            orders={orders}
            patientZeroId={game.config.patientZeroId}
            styleMode={styleMode}
            onChangeStyleMode={setStyleMode}
            onSwitchTo2D={() => setMapView("2d")}
          />
        ) : (
          <CureCityMap
            snapshot={snapshot}
            selectedNode={selectedNode}
            onSelect={selectZone}
            orders={orders}
            onSwitchTo3D={(mode) => {
              setStyleMode(mode);
              setMapView("3d");
            }}
          />
        )}
      </main>

      <section className="hud-situation" aria-label="Situación en tiempo real">
        <div className="hud-title">
          <span>SITUACIÓN EN TIEMPO REAL</span>
          <Activity size={12} />
        </div>
        <div className="hud-metric coral">
          <span className="hud-icon">
            <Users size={13} />
          </span>
          <span>Infecciosos</span>
          <strong>{format(snapshot.totalI)}</strong>
          <small>
            {newCases > 0 ? `+${format(newCases)} hoy` : "Sin nuevos hoy"}
          </small>
        </div>
        <div className="hud-metric">
          <span className="hud-icon">
            <ShieldCheck size={13} />
          </span>
          <span>Inmunes</span>
          <strong>{format(snapshot.totalR)}</strong>
          <small>
            {((snapshot.totalR / TOTAL_MANTA_POPULATION) * 100).toFixed(1)}% de
            la ciudad
          </small>
        </div>
        <div className="hud-metric hospital">
          <span className="hud-icon">
            <HeartPulse size={13} />
          </span>
          <span>Hospital</span>
          <strong className={hospitalLoad > 100 ? "coral-text" : ""}>
            {hospitalLoad}%
          </strong>
          <small className={snapshot.hospitalCollapsed ? "over" : ""}>
            {snapshot.hospitalCollapsed ? "Saturado" : "Operativo"}
          </small>
          <div className="hud-hospital-track">
            <i
              className={hospitalLoad > 70 ? "over" : ""}
              style={{ width: `${Math.min(100, hospitalLoad)}%` }}
            />
          </div>
        </div>
      </section>

      {(news || newsLoading) && (
        <NewsFlash
          news={news}
          loading={newsLoading}
          day={game.day}
          facts={newsFacts}
          onClose={closeNews}
        />
      )}

      <footer className="command-bar">
        {chapter && chapterId !== undefined && (
          <div className="campaign-objective" aria-label="Objetivo del capítulo">
            <span>CAPÍTULO {chapterId + 1}/3 · {chapter.title}</span>
            <strong>{chapter.objective}</strong>
            <small>{campaignReadout(chapterId, snapshot, game.research)}</small>
            {!playing && <button className="secondary-button" onClick={() => setModal("result")}>Ver resultado del capítulo</button>}
          </div>
        )}
        <div className="command-row primary">
          <div className="cash-block">
            <span>
              PRESUPUESTO <b>USD / DÍA</b>
            </span>
            <strong>
              ${format(remaining)}
              <small> / ${format(game.params.dailyBudget)}</small>
            </strong>
            <div className="budget-segments" aria-hidden="true">
              {Array.from({ length: 20 }, (_, index) => (
                <i
                  key={index}
                  className={
                    (remaining / game.params.dailyBudget) * 20 > index
                      ? "filled"
                      : ""
                  }
                />
              ))}
            </div>
          </div>
          <div className="zone-block">
            <span>
              ZONA <b>{node.id}</b>
            </span>
            <strong>{node.name}</strong>
            <select
              className="mobile-zone-select"
              aria-label="Seleccionar zona de intervención"
              value={selectedNode}
              onChange={(event) => selectZone(event.target.value)}
            >
              {MANTA_NODES.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
            <small>
              {format(local.S)} susceptibles ·{" "}
              <b>{format(local.I)} infecciosos</b>
            </small>
          </div>
          <div className="cure-block">
            <span>
              DESARROLLO DE LA CURA <b>{game.research}%</b>
            </span>
            <div className="cure-progress-line">
              <span style={{ width: `${game.research}%` }} />
              <i style={{ left: "25%" }} />
              <i style={{ left: "65%" }} />
            </div>
            <small>
              {game.research === 100 ? (
                <b>Antídoto validado</b>
              ) : (
                <>
                  Fase 0{stage + 1} · {PHASES[stage]}
                </>
              )}
            </small>
          </div>
          <div className="day-block">
            <span>DÍA</span>
            <strong>{String(game.day).padStart(2, "0")}</strong>
            <span>/ {game.params.days}</span>
          </div>
          <button
            className="advance-button"
            onClick={nextDay}
            disabled={!playing || dayTransition !== null}
            aria-busy={dayTransition !== null}
          >
            {playing
              ? "Avanzar un día"
              : game.status === "won"
                ? chapter ? "Capítulo completado" : "Cura encontrada"
                : "Misión finalizada"}
            {playing ? <ArrowRight size={18} /> : <Check size={18} />}
          </button>
        </div>

        {(orders.length > 0 || eventBonus) && (
          <div className="command-row plan-row">
            <span>
              PLAN DE HOY · {orders.length + Number(!!eventBonus)}{" "}
              {orders.length + Number(!!eventBonus) === 1 ? "BRIGADA" : "BRIGADAS"}
            </span>
            <ul className="plan-chips">
              {eventBonus && <li><FlaskConical size={11} />Prevención GRATIS · {NODE_MAP[eventBonus.nodeId].name} · siguiente día</li>}
              {orders.map((order, index) => {
                const Icon = ICONS[order.kind];
                return (
                  <li key={`${order.nodeId}-${order.kind}`}>
                    <Icon size={11} />
                    {INTERVENTIONS[order.kind].label} ·{" "}
                    {NODE_MAP[order.nodeId].name}
                    <button
                      aria-label={`Retirar ${INTERVENTIONS[order.kind].label} de ${NODE_MAP[order.nodeId].name}`}
                      onClick={() =>
                        setOrders((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X size={11} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="command-row actions">
          <div
            className="research-select"
            role="group"
            aria-label="Inversión en la cura"
          >
            <span className="rs-label">
              LABORATORIO
              <b>{researchGain ? `+${researchGain} pp/día` : "pausado"}</b>
            </span>
            {RESEARCH_LEVELS.map((amount) => (
              <button
                key={amount}
                className={funding === amount ? "active" : ""}
                disabled={
                  !playing ||
                  getPlanCost(orders, amount) > game.params.dailyBudget
                }
                onClick={() => {
                  setFunding(amount);
                  setNotice(`Investigación: $${format(amount)} por día.`);
                }}
              >
                ${format(amount)}
                <small>{FUNDING_LABELS[amount]}</small>
              </button>
            ))}
          </div>
        </div>
      </footer>

      <div className="sr-only" role="status" aria-live="polite">
        {notice}
      </div>
      {dayTransition && <DayTransition report={dayTransition} />}

      {modal === "campaign" && (
        <Dialog title={CHAPTERS[briefingChapter].title} onClose={closeModal}>
          <div className="campaign-briefing">
            <span className="eyebrow">CAPÍTULO {briefingChapter + 1} / 3 · {CHAPTERS[briefingChapter].location}</span>
            <p>{CHAPTERS[briefingChapter].briefing}</p>
            <strong>{CHAPTERS[briefingChapter].objective}</strong>
            <ol>
              {CHAPTERS.map((item, index) => <li key={item.title} aria-current={index === briefingChapter ? "step" : undefined}>{String(index + 1).padStart(2, "0")} / {item.title}</li>)}
            </ol>
          </div>
          <p className="model-disclaimer">Cada capítulo es una operación independiente con semilla fija y $7.500 diarios. Iniciar descarta la partida actual. El progreso no se guarda al recargar.</p>
          <button className="primary-button" onClick={() => newGame({ ...DEFAULT_CONFIG, campaignChapter: briefingChapter, patientZeroId: CHAPTERS[briefingChapter].nodeId })}>
            Iniciar capítulo {briefingChapter + 1} <ArrowRight size={17} />
          </button>
        </Dialog>
      )}

      {modal === "event" && activeEvent && (
        <Dialog title="Incidente en el laboratorio" onClose={closeModal}>
          <LabSpontaneousEvent event={activeEvent} onClose={closeModal} onComplete={(success) => {
            if (success) {
              setEventBonus({ nodeId: activeEvent.nodeId, kind: "prevention" });
              setNotice(`Calibración correcta: prevención gratuita lista para ${NODE_MAP[activeEvent.nodeId].name}.`);
            } else setNotice("Calibración omitida o fallida; no se aplicó ninguna penalización.");
          }} />
        </Dialog>
      )}

      {modal === "zone" && (
        <Dialog title={node.name} onClose={closeModal}>
          <p className="dialog-intro">
            {format(local.S)} susceptibles · {format(local.I)} infecciosos · ${format(remaining)} disponibles
          </p>
          <div className="intervention-strip">
            {(Object.keys(INTERVENTIONS) as Intervention[]).map((kind) => {
              const Icon = ICONS[kind];
              const action = INTERVENTIONS[kind];
              const coveredByLab = kind === "prevention" && eventBonus?.nodeId === selectedNode;
              const assigned = orders.some(
                (order) =>
                  order.nodeId === selectedNode && order.kind === kind,
              );
              return (
                <button
                  key={kind}
                  className={`quick-action ${assigned ? "assigned" : ""}`}
                  aria-pressed={assigned || coveredByLab}
                  aria-label={`${action.label} en ${node.name}: ${coveredByLab ? "gratis, cubierta por el laboratorio" : `$${action.cost}`}`}
                  onClick={() => {
                    if (assigned) {
                      setOrders((current) => current.filter(
                        (order) => order.nodeId !== selectedNode || order.kind !== kind,
                      ));
                      setNotice(`${action.label} retirada de ${node.name}.`);
                    } else queueOrder(kind);
                  }}
                  disabled={
                    coveredByLab ||
                    !playing ||
                    (!assigned && (remaining < action.cost ||
                      (kind === "vaccine" && local.S === 0)))
                  }
                >
                  <span className={`qa-icon ${kind}`}>
                    <Icon size={14} />
                  </span>
                  <span>
                    <strong>{action.label}</strong>
                    <small>{kind === "vaccine" ? `${game.params.vaccineBatchSize} dosis · solo población susceptible` : action.description}</small>
                  </span>
                  {coveredByLab ? <b className="qa-cost">GRATIS</b> : assigned ? (
                    <Check className="qa-check" size={14} />
                  ) : (
                    <b className="qa-cost">${format(action.cost)}</b>
                  )}
                </button>
              );
            })}
          </div>
          <p className="dialog-intro">Selecciona una intervención para asignarla o retirarla del plan.</p>
        </Dialog>
      )}
      {modal === "logout" && (
        <Dialog title="¿Cerrar sesión?" onClose={closeModal}>
          <p className="dialog-intro">
            La partida actual no se guarda. Podrás volver a iniciar sesión con tus credenciales.
          </p>
          <button
            className="primary-button"
            onClick={onLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Cerrando sesión…" : "Salir de la operación"}
            <LogOut size={16} />
          </button>
          <button
            className="secondary-button"
            onClick={closeModal}
            disabled={loggingOut}
          >
            Seguir jugando
          </button>
        </Dialog>
      )}
      {modal === "help" && (
        <Dialog title="Aprende a jugar." onClose={closeModal}>
          <GameTutorial config={DEFAULT_CONFIG} onClose={closeModal} />
        </Dialog>
      )}
      {modal === "settings" && (
        <Dialog title="Prepara una nueva misión." onClose={closeModal}>
          <p className="dialog-intro">
            Misma semilla + escenario + decisiones = mismo resultado. Reiniciar
            descarta la partida actual.
          </p>
          <div className="settings-fields">
            <label>
              Semilla reproducible
              <input
                type="number"
                min="0"
                max="4294967295"
                value={Number.isNaN(draft.seed) ? "" : draft.seed}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    seed: e.target.value === "" ? NaN : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Origen del brote
              <select
                value={draft.patientZeroId}
                onChange={(e) =>
                  setDraft({ ...draft, patientZeroId: e.target.value })
                }
              >
                {MANTA_NODES.map((n) => (
                  <option value={n.id} key={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Escenario del jurado
              <select
                value={draft.scenario}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    scenario: e.target.value as GameConfig["scenario"],
                  })
                }
              >
                <option value="standard">Estándar · Necro-Dengue</option>
                <option value="surprise">
                  Brote sorpresa · doble contagio humano
                </option>
                <option value="escape">Escape inmune · vacuna al 45%</option>
              </select>
            </label>
            <label>
              Dosis por brigada · $2.400 por lote
              <input type="number" min="10" max="5000" step="1"
                value={Number.isNaN(draft.vaccineBatchSize) ? "" : (draft.vaccineBatchSize ?? 850)}
                onChange={(e) => setDraft({ ...draft, vaccineBatchSize: e.target.value === "" ? NaN : Number(e.target.value) })}
              />
            </label>
            <button className="secondary-button" type="button" onClick={() => setDraft({ ...draft, vaccineBatchSize: 425 })}>
              Mitad de vacunas · 425 dosis por lote
            </button>
            <label>
              Presupuesto diario
              <select
                value={draft.dailyBudget}
                onChange={(e) =>
                  setDraft({ ...draft, dailyBudget: Number(e.target.value) })
                }
              >
                {BUDGET_LEVELS.map((amount) => (
                  <option value={amount} key={amount}>
                    ${format(amount)} · {BUDGET_LABELS[amount]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="primary-button"
            disabled={
              !Number.isInteger(draft.vaccineBatchSize ?? 850) ||
              (draft.vaccineBatchSize ?? 850) < 10 ||
              (draft.vaccineBatchSize ?? 850) > 5000 ||
              !Number.isInteger(draft.seed) ||
              draft.seed < 0 ||
              draft.seed > 4294967295
            }
            onClick={() => newGame()}
          >
            Iniciar nueva misión
            <ArrowRight size={17} />
          </button>
        </Dialog>
      )}
      {modal === "result" && (
        <Dialog
          title={
            game.status === "won"
              ? chapter ? chapter.title : "Manta tiene una nueva oportunidad."
              : "No toda misión termina aquí."
          }
          onClose={closeModal}
        >
          <div className={`result-symbol ${game.status}`}>
            <FlaskConical size={40} />
          </div>
          <p className="result-kicker">
            {game.status === "won"
              ? chapter ? "CAPÍTULO COMPLETADO" : "CURA VALIDADA · MISIÓN CUMPLIDA"
              : "MISIÓN FINALIZADA · VUELVE A INTENTARLO"}
          </p>
          <p className="dialog-intro">
            {chapter && chapterId !== undefined ? (game.status === "won" ? chapter.victory : `Objetivo no alcanzado. ${chapter.objective}`) : game.status === "won"
              ? `En ${game.day} días tu equipo completó el antídoto. El ${((1 - snapshot.cumulativeInfected / TOTAL_MANTA_POPULATION) * 100).toFixed(1)}% de la población no contrajo la infección.`
              : `La cura llegó al ${game.research}%. ${snapshot.cumulativeInfected >= TOTAL_MANTA_POPULATION * LOSS_THRESHOLD ? "El brote alcanzó al 35% de la población." : "Se agotaron los 40 días de la misión."} Revisa tu estrategia y prueba otra distribución de recursos.`}
          </p>
          <div className="result-stats">
            <div>
              <span>Contagios acumulados</span>
              <strong>{format(snapshot.cumulativeInfected)}</strong>
            </div>
            <div>
              <span>Inmunes y recuperados</span>
              <strong>{format(snapshot.totalR)}</strong>
            </div>
            <div>
              <span>Pico de infecciosos</span>
              <strong>{format(Math.max(...game.timeline.map((day) => day.totalI)))}</strong>
            </div>
            <div>
              <span>Gasto total ejecutado</span>
              <strong>${format(Object.values(game.actions).reduce((sum, action) => sum + action.budgetSpent, 0))}</strong>
            </div>
            <div>
              <span>Avance de la cura</span>
              <strong>{game.research}%</strong>
            </div>
          </div>
          <StrategyReport game={game} plan="PLAYER" seed={game.config.seed} days={game.day} />
          {chapter && chapterId !== undefined && (
            <button className="primary-button" onClick={() => {
              if (game.status === "won" && chapterId < 2) {
                setBriefingChapter((chapterId + 1) as CampaignChapter);
                setModal("campaign");
              } else newGame(game.config);
            }}>
              {game.status === "won" && chapterId < 2 ? "Siguiente capítulo" : "Repetir capítulo"} <ArrowRight size={17} />
            </button>
          )}
          <button className="primary-button" onClick={openAnalysis}>
            Comparar mi estrategia
            <TrendingDown size={17} />
          </button>
          <button className="secondary-button" onClick={openSettings}>
            <RotateCcw size={15} />
            Volver a jugar
          </button>
        </Dialog>
      )}
      {modal === "analysis" && (
        <Dialog title="Los datos, no las promesas." onClose={closeModal} wide>
          <p className="dialog-intro">
            Comparación hasta el día {game.day} · 20 corridas por estrategia ·
            mismo presupuesto de ${format(game.params.dailyBudget)}/día.
          </p>
          {isEvaluating ? (
            <div className="analysis-loading">
              <Microscope size={32} />
              <p>Repitiendo el brote con semillas reproducibles…</p>
            </div>
          ) : evaluation ? (
            <>
              <div className="evaluation-grid">
                <div className="player-result">
                  <span>TU PLAN</span>
                  <strong>{format(evaluation.playerMean)}</strong>
                  <small>contagios medios</small>
                  <p>
                    Rango P10–P90
                    <br />
                    {format(evaluation.playerP10)} –{" "}
                    {format(evaluation.playerP90)}
                  </p>
                </div>
                {(
                  ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"] as const
                ).map((strategy) => {
                  const result = evaluation.comparison.strategies[strategy];
                  return (
                    <div key={strategy}>
                      <span>
                        {strategy === "NO_INTERVENTION"
                          ? "SIN INTERVENIR"
                          : strategy === "RANDOM"
                            ? "AL AZAR"
                            : "SGC AUTOMÁTICA"}
                      </span>
                      <strong>{format(result.meanTotalInfected)}</strong>
                      <small>contagios medios</small>
                      <p>
                        Rango P10–P90
                        <br />
                        {format(result.p10TotalInfected)} –{" "}
                        {format(result.p90TotalInfected)}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="evaluation-verdict">
                <TrendingDown size={21} />
                <p>
                  {evaluation.comparison.strategies.NO_INTERVENTION
                    .meanTotalInfected -
                    evaluation.playerMean >=
                  0
                    ? "Tu plan evita"
                    : "Tu plan produce"}{" "}
                  <b>
                    {format(
                      Math.abs(
                        evaluation.comparison.strategies.NO_INTERVENTION
                          .meanTotalInfected - evaluation.playerMean,
                      ),
                    )}
                  </b>{" "}
                  contagios{" "}
                  {evaluation.comparison.strategies.NO_INTERVENTION
                    .meanTotalInfected -
                    evaluation.playerMean >=
                  0
                    ? "frente a no intervenir."
                    : "más que no intervenir."}
                </p>
              </div>
              <ComparisonChart
                result={evaluation.comparison}
                currentDay={analysisDay}
                onSelectDay={setAnalysisDay}
                activeStrategy="SMART_CORTAFUEGOS"
              />
              <p className="model-disclaimer">
                La gráfica muestra las tres estrategias automáticas; tu plan se
                resume arriba. Se repite tu calendario de brigadas, no tus
                decisiones adaptativas. Tu presupuesto incluye investigación;
                las líneas base lo dedican a contención. P10–P90 es dispersión
                de corridas, no intervalo de confianza. No se asume que una
                estrategia siempre gane.
              </p>
            </>
          ) : (
            <p>No hay resultados disponibles. Cierra y vuelve a evaluar.</p>
          )}
          <button className="secondary-button" onClick={closeModal}>
            Volver al centro de respuesta
            <ArrowRight size={16} />
          </button>
        </Dialog>
      )}
    </div>
  );
}
