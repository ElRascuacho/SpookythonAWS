import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  CircleHelp,
  Clock3,
  Dna,
  FlaskConical,
  HeartPulse,
  MapPin,
  Microscope,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  ShieldPlus,
  SprayCan,
  Target,
  Trash2,
  TrendingDown,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { CureCityMap } from "./components/CureCityMap";
import { ComparisonChart } from "./components/ComparisonChart";
import {
  advanceDay,
  createGame,
  getPlanCost,
  INTERVENTIONS,
  LOSS_THRESHOLD,
  MAX_DAYS,
  type GameConfig,
  type Intervention,
  type Order,
  type ResearchFunding,
} from "./domain/cureGame";
import {
  MANTA_NODES,
  NODE_MAP,
  TOTAL_MANTA_POPULATION,
} from "./domain/mantaGraph";
import {
  computePercentile,
  runMonteCarloComparison,
} from "./domain/monteCarlo";
import { runSingleSeirSimulation } from "./domain/seirEngine";
import type { MonteCarloComparisonResult } from "./domain/types";

const DEFAULT_CONFIG: GameConfig = {
  seed: 20261030,
  scenario: "standard",
  patientZeroId: "N01",
  dailyBudget: 1000,
};
const format = (value: number) => value.toLocaleString("es-EC");
const ICONS: Record<Intervention, LucideIcon> = {
  vaccine: ShieldPlus,
  fumigate: SprayCan,
  cordon: ShieldCheck,
};
type Modal = "help" | "settings" | "analysis" | "result" | null;
interface Evaluation {
  comparison: MonteCarloComparisonResult;
  playerMean: number;
  playerP10: number;
  playerP90: number;
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

export default function App() {
  const [game, setGame] = useState(() => createGame(DEFAULT_CONFIG));
  const [selectedNode, setSelectedNode] = useState("N01");
  const [orders, setOrders] = useState<Order[]>([]);
  const [funding, setFunding] = useState<ResearchFunding>(250);
  const [tab, setTab] = useState<"field" | "lab">("field");
  const [modal, setModal] = useState<Modal>(null);
  const [draft, setDraft] = useState<GameConfig>(DEFAULT_CONFIG);
  const [showTip, setShowTip] = useState(true);
  const [notice, setNotice] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [analysisDay, setAnalysisDay] = useState(0);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const closeModal = () => setModal(null);
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
  const playing = game.status === "playing";

  const queueOrder = (kind: Intervention) => {
    setOrders((current) => [...current, { nodeId: selectedNode, kind }]);
    setNotice(
      `${INTERVENTIONS[kind].label} asignada a ${node.name}. Se ejecutará al avanzar el día.`,
    );
    setShowTip(false);
  };
  const nextDay = () => {
    try {
      const next = advanceDay(game, orders, funding);
      setGame(next);
      setOrders([]);
      setEvaluation(null);
      setNotice(`Día ${next.day}: ${next.log[0]}`);
      setShowTip(false);
      if (next.status !== "playing") setModal("result");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo avanzar.");
    }
  };
  const newGame = () => {
    try {
      setGame(createGame(draft));
      setSelectedNode(draft.patientZeroId);
      setOrders([]);
      setFunding(250);
      setEvaluation(null);
      setNotice("Nueva misión iniciada.");
      setModal(null);
      setShowTip(true);
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
    setDraft({ ...game.config });
    setModal("settings");
  };

  return (
    <div className="game-shell">
      <header className="topbar">
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
        </nav>
      </header>
      <main className="command-layout">
        <aside className="situation-panel">
          <div className="operation-label">
            <span className="eyebrow">CENTRO DE RESPUESTA</span>
            <span className="operation-index">EC—04</span>
          </div>
          <div className="mission-title">
            <h1>
              Una ciudad.
              <br />
              Una última
              <br />
              <em>oportunidad.</em>
            </h1>
            <p>
              Contén el brote.
              <br />
              Encuentra la cura. Salva Manta.
            </p>
          </div>
          <div className="mission-objective">
            <div className="objective-icon">
              <Target size={19} />
            </div>
            <div>
              <span>OBJETIVO DE LA MISIÓN</span>
              <p>
                Desarrolla la cura antes del día {MAX_DAYS}, sin que el brote
                alcance al {LOSS_THRESHOLD * 100}% de la población.
              </p>
            </div>
          </div>
          <div className="section-title">
            <span>SITUACIÓN EN TIEMPO REAL</span>
            <Activity size={14} />
          </div>
          <div className="situation-stat">
            <div className="stat-symbol coral">
              <Users size={18} />
            </div>
            <div>
              <span>Infecciosos activos</span>
              <strong className="coral-text">{format(snapshot.totalI)}</strong>
            </div>
            <svg viewBox="0 0 64 30" className="sparkline" aria-hidden="true">
              <path
                d={`M0 27 ${game.timeline
                  .slice(-12)
                  .map(
                    (s, i, arr) =>
                      `L${((i + 1) / arr.length) * 62} ${27 - (s.totalI / Math.max(1, ...game.timeline.map((t) => t.totalI))) * 24}`,
                  )
                  .join(" ")}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          <div className="situation-stat">
            <div className="stat-symbol mint">
              <ShieldCheck size={18} />
            </div>
            <div>
              <span>Recuperados e inmunes</span>
              <strong>{format(snapshot.totalR)}</strong>
            </div>
            <ArrowUpRight size={19} className="muted" />
          </div>
          <div className="hospital-status">
            <div>
              <HeartPulse size={15} />
              <span>Capacidad hospitalaria</span>
              <b className={hospitalLoad > 100 ? "coral-text" : ""}>
                {hospitalLoad}%
              </b>
            </div>
            <div className="thin-progress">
              <span
                style={{
                  width: `${Math.min(100, hospitalLoad)}%`,
                  background:
                    hospitalLoad > 70 ? "var(--coral)" : "var(--mint)",
                }}
              />
            </div>
            <small>
              {snapshot.hospitalCollapsed
                ? "SATURADO · recuperación reducida"
                : `${format(game.params.hospitalCapacity)} plazas · operativo`}
            </small>
          </div>
          <div className="transmission">
            <div className="section-title">
              <span>ÚLTIMA TRANSMISIÓN</span>
              <Radio size={14} />
            </div>
            <div className="transmission-content">
              <span className="transmission-day">
                DÍA {String(game.day).padStart(2, "0")}
              </span>
              <p key={game.day}>{game.log[0]}</p>
              <span className="transmission-source">
                <AudioLines size={12} /> RED DE VIGILANCIA · MANTA
              </span>
            </div>
          </div>
          <button className="analysis-link" onClick={openAnalysis}>
            <TrendingDown size={17} />
            <span>
              Evaluar mi estrategia
              <small>20 corridas · dos líneas base + SGC</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
          <div className="scenario-footnote">
            <span className="dot mint" />
            MODELO SEIR-V <span>SEMILLA {game.config.seed}</span>
          </div>
        </aside>
        <div className="map-column">
          <div className="mobile-objective">
            ENCUENTRA LA CURA <span>40 días · menos de 35% de contagios</span>
          </div>
          <div className="map-statusbar">
            <div>
              <span className="live-dot" />
              VIGILANCIA ACTIVA{" "}
              <span className="status-muted">
                /{" "}
                {game.config.scenario === "standard"
                  ? "BROTE INICIAL"
                  : game.config.scenario === "surprise"
                    ? "DOBLE CONTAGIO"
                    : "ESCAPE INMUNE"}
              </span>
            </div>
            <span>
              <MapPin size={12} /> MANABÍ, ECUADOR
            </span>
          </div>
          <CureCityMap
            snapshot={snapshot}
            selectedNode={selectedNode}
            onSelect={(id) => {
              setSelectedNode(id);
              setTab("field");
            }}
            orders={orders}
          />
          {showTip && (
            <div className="map-tip">
              <span className="tip-number">01</span>
              <div>
                <strong>Tu primera decisión importa.</strong>
                <p>
                  Selecciona una zona del mapa y asigna una brigada. Reserva
                  fondos para la cura.
                </p>
              </div>
              <button
                aria-label="Ocultar consejo"
                onClick={() => setShowTip(false)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="map-bottomline">
            <span>
              <i className="dot coral" />
              {format(snapshot.cumulativeInfected)} contagios acumulados
            </span>
            <span>
              {newCases > 0
                ? `+${format(newCases)} en el último día`
                : "El tiempo avanza cuando tú decides"}
            </span>
          </div>
        </div>
        <aside className="actions-panel">
          <div className="actions-heading">
            <span className="eyebrow">TOMA EL CONTROL</span>
            <h2>Cada decisión cuenta.</h2>
          </div>
          <div className="budget-card">
            <div>
              <span>PRESUPUESTO DISPONIBLE</span>
              <span className="daily-tag">DIARIO</span>
            </div>
            <strong>
              ${format(remaining)}
              <small> / ${format(game.params.dailyBudget)}</small>
            </strong>
            <div className="budget-segments">
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
            <p>Se renueva cada día. No es acumulable.</p>
          </div>
          <div
            className="action-tabs"
            role="tablist"
            aria-label="Centro de decisiones"
          >
            <button
              role="tab"
              aria-selected={tab === "field"}
              id="field-tab"
              aria-controls="field-panel"
              onClick={() => setTab("field")}
              className={tab === "field" ? "active" : ""}
            >
              <ShieldPlus size={15} />
              En terreno
            </button>
            <button
              role="tab"
              aria-selected={tab === "lab"}
              id="lab-tab"
              aria-controls="lab-panel"
              onClick={() => setTab("lab")}
              className={tab === "lab" ? "active" : ""}
            >
              <FlaskConical size={15} />
              Laboratorio
            </button>
          </div>
          {tab === "field" ? (
            <div
              role="tabpanel"
              id="field-panel"
              aria-labelledby="field-tab"
              className="field-panel"
            >
              <div className="selected-zone">
                <span>
                  <MapPin size={12} /> ZONA SELECCIONADA <b>{node.id}</b>
                </span>
                <h3>{node.name}</h3>
                <select
                  className="mobile-zone-select"
                  aria-label="Seleccionar zona de intervención"
                  value={selectedNode}
                  onChange={(event) => setSelectedNode(event.target.value)}
                >
                  {MANTA_NODES.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
                <p>
                  {format(local.S)} susceptibles <span>·</span>
                  <b>{format(local.I)} infecciosos</b>
                </p>
              </div>
              <div className="interventions">
                {(Object.keys(INTERVENTIONS) as Intervention[]).map((kind) => {
                  const Icon = ICONS[kind];
                  const action = INTERVENTIONS[kind];
                  const assigned = orders.some(
                    (order) =>
                      order.nodeId === selectedNode && order.kind === kind,
                  );
                  return (
                    <button
                      key={kind}
                      className={`intervention ${assigned ? "assigned" : ""}`}
                      onClick={() => queueOrder(kind)}
                      disabled={
                        !playing ||
                        assigned ||
                        remaining < action.cost ||
                        (kind === "vaccine" && local.S === 0)
                      }
                    >
                      <span className={`intervention-icon ${kind}`}>
                        <Icon size={21} />
                      </span>
                      <span>
                        <strong>{action.label}</strong>
                        <small>{action.description}</small>
                        <b>
                          ${action.cost}
                          <span> / brigada</span>
                        </b>
                      </span>
                      <span className="intervention-add">
                        {assigned ? <Check size={16} /> : <Plus size={16} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              role="tabpanel"
              id="lab-panel"
              aria-labelledby="lab-tab"
              className="laboratory-panel"
            >
              <div className="lab-art">
                <Dna size={54} />
                <span>PROYECTO ANTÍDOTO / M—01</span>
              </div>
              <h3>
                La ciencia necesita tiempo.
                <br />Y tú puedes comprarlo.
              </h3>
              <p>
                La investigación avanza solo si recibe fondos. La cura se valida
                al llegar al 100%.
              </p>
              <div className="research-stages">
                {[
                  "Secuenciar el patógeno",
                  "Desarrollar el antídoto",
                  "Validar la cura",
                ].map((label, index) => (
                  <div
                    className={
                      index < stage || game.research === 100
                        ? "complete"
                        : index === stage
                          ? "current"
                          : ""
                    }
                    key={label}
                  >
                    <span>
                      {index < stage || game.research === 100 ? (
                        <Check size={12} />
                      ) : (
                        `0${index + 1}`
                      )}
                    </span>
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="research-funding">
            <div className="section-title">
              <span>
                <FlaskConical size={13} /> INVERSIÓN EN LA CURA
              </span>
              <span className="mint-text">
                +{funding === 500 ? 5 : funding === 250 ? 3 : 0}% / día
              </span>
            </div>
            <div className="funding-options">
              {([0, 250, 500] as ResearchFunding[]).map((amount) => (
                <button
                  key={amount}
                  className={funding === amount ? "active" : ""}
                  disabled={
                    !playing ||
                    getPlanCost(orders, amount) > game.params.dailyBudget
                  }
                  onClick={() => {
                    setFunding(amount);
                    setNotice(`Investigación: $${amount} por día.`);
                  }}
                >
                  ${amount}
                  <small>
                    {amount === 0
                      ? "Pausar"
                      : amount === 250
                        ? "Estándar"
                        : "Prioridad"}
                  </small>
                </button>
              ))}
            </div>
          </div>
          <div className="orders-section">
            <div className="section-title">
              <span>PLAN DEL PRÓXIMO DÍA</span>
              <b>{orders.length} BRIGADAS</b>
            </div>
            {orders.length ? (
              <ul className="orders-list">
                {orders.map((order, index) => {
                  const Icon = ICONS[order.kind];
                  return (
                    <li key={`${order.nodeId}-${order.kind}`}>
                      <Icon size={13} />
                      <span>
                        {INTERVENTIONS[order.kind].label}
                        <small>{NODE_MAP[order.nodeId].name}</small>
                      </span>
                      <button
                        aria-label={`Retirar ${INTERVENTIONS[order.kind].label} de ${NODE_MAP[order.nodeId].name}`}
                        onClick={() =>
                          setOrders((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty-orders">
                Selecciona una intervención para desplegar tu primera brigada.
              </p>
            )}
          </div>
        </aside>
      </main>
      <footer className="turnbar">
        <div className="cure-progress">
          <span className="cure-icon">
            <FlaskConical size={24} />
          </span>
          <div className="cure-track">
            <div>
              <span>DESARROLLO DE LA CURA</span>
              <strong>
                {game.research}
                <small>%</small>
              </strong>
            </div>
            <div className="cure-progress-line">
              <span style={{ width: `${game.research}%` }} />
              <i style={{ left: "25%" }} />
              <i style={{ left: "65%" }} />
            </div>
            <small>
              {game.research === 100
                ? "Antídoto validado"
                : [
                    "Fase 01 · Secuenciación del patógeno",
                    "Fase 02 · Desarrollo del antídoto",
                    "Fase 03 · Validación de la cura",
                  ][stage]}
            </small>
          </div>
        </div>
        <div className="turn-instruction">
          <Clock3 size={15} />
          <span>
            Sin prisa. Con estrategia.
            <small>Las órdenes se ejecutan al avanzar.</small>
          </span>
        </div>
        <div className="day-counter">
          <span>DÍA</span>
          <strong>{String(game.day).padStart(2, "0")}</strong>
          <span>/ {MAX_DAYS}</span>
        </div>
        <button
          className="advance-button"
          onClick={nextDay}
          disabled={!playing}
        >
          {playing
            ? "Avanzar un día"
            : game.status === "won"
              ? "Cura encontrada"
              : "Misión finalizada"}
          {playing ? <ArrowRight size={19} /> : <Check size={19} />}
        </button>
      </footer>
      <div className="sr-only" role="status" aria-live="polite">
        {notice}
      </div>

      {modal === "help" && (
        <Dialog title="La misión es encontrar la cura." onClose={closeModal}>
          <p className="dialog-intro">
            Eres el comité de respuesta de Manta. No controlas el virus:
            proteges a la ciudad mientras la ciencia encuentra una salida.
          </p>
          <div className="help-steps">
            <div>
              <MapPin />
              <span>
                <b>01. Lee el mapa</b>Selecciona una de las 16 zonas. Coral
                significa infección activa.
              </span>
            </div>
            <div>
              <ShieldPlus />
              <span>
                <b>02. Construye tu plan</b>Vacuna susceptibles, fumiga el
                vector o corta rutas por un día. Retira órdenes antes de
                ejecutar.
              </span>
            </div>
            <div>
              <FlaskConical />
              <span>
                <b>03. Financia la cura</b>$250 suma 3%; $500 suma 5% por día.
                El presupuesto se renueva y no se acumula.
              </span>
            </div>
            <div>
              <ArrowRight />
              <span>
                <b>04. Avanza y adapta</b>Ganas con la cura al 100%. Pierdes al
                alcanzar 35% de contagios acumulados o al terminar el día 40 sin
                cura.
              </span>
            </div>
          </div>
          <p className="model-disclaimer">
            Simulación educativa ficticia, no herramienta clínica. R combina
            recuperados e inmunizados. Los contagios evitados no equivalen a
            muertes evitadas. La semilla y tus decisiones hacen la partida
            reproducible.
          </p>
          <button className="primary-button" onClick={closeModal}>
            Entendido. Vamos a salvar Manta.
            <ArrowRight size={17} />
          </button>
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
              Presupuesto diario
              <select
                value={draft.dailyBudget}
                onChange={(e) =>
                  setDraft({ ...draft, dailyBudget: Number(e.target.value) })
                }
              >
                <option value={500}>$500 · recursos reducidos</option>
                <option value={1000}>$1.000 · estándar</option>
                <option value={1500}>$1.500 · refuerzo municipal</option>
              </select>
            </label>
          </div>
          <button
            className="primary-button"
            disabled={
              !Number.isInteger(draft.seed) ||
              draft.seed < 0 ||
              draft.seed > 4294967295
            }
            onClick={newGame}
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
              ? "Manta tiene una nueva oportunidad."
              : "No toda misión termina aquí."
          }
          onClose={closeModal}
        >
          <div className={`result-symbol ${game.status}`}>
            <FlaskConical size={40} />
          </div>
          <p className="result-kicker">
            {game.status === "won"
              ? "CURA VALIDADA · MISIÓN CUMPLIDA"
              : "MISIÓN FINALIZADA · VUELVE A INTENTARLO"}
          </p>
          <p className="dialog-intro">
            {game.status === "won"
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
          </div>
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
