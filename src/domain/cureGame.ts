import { BUDGET_LEVELS, ECONOMY } from "./economy";
import { CHAPTERS, campaignStatus, type CampaignChapter } from "./campaign";
import {
  DEFAULT_SIMULATION_PARAMS,
  MANTA_EDGES,
  NODE_MAP,
  TOTAL_MANTA_POPULATION,
} from "./mantaGraph";
import { runSingleSeirSimulation } from "./seirEngine";
import type { DailyAction, DailyCitySnapshot, SimulationParams } from "./types";

export type Intervention = "vaccine" | "fumigate" | "cordon" | "isolation" | "prevention";
export type Scenario = "standard" | "surprise" | "escape";
export interface Order {
  nodeId: string;
  kind: Intervention;
}
export interface GameConfig {
  campaignChapter?: CampaignChapter;
  vaccineBatchSize?: number;
  seed: number;
  scenario: Scenario;
  patientZeroId: string;
  dailyBudget: number;
}
export interface CureGame {
  config: GameConfig;
  params: SimulationParams;
  day: number;
  research: number;
  actions: Record<number, DailyAction>;
  timeline: DailyCitySnapshot[];
  status: "playing" | "won" | "lost";
  log: string[];
}

export const MAX_DAYS = 40;
export const LOSS_THRESHOLD = 0.35;
export const RESEARCH_LEVELS = [
  0,
  ECONOMY.researchStandardUsd,
  ECONOMY.researchPriorityUsd,
] as const;
export type ResearchFunding = (typeof RESEARCH_LEVELS)[number];
export const INTERVENTIONS = {
  vaccine: {
    label: "Vacunación",
    cost: ECONOMY.vaccineLotUsd,
    description: `${ECONOMY.vaccineLotDoses} dosis · solo población susceptible`,
  },
  fumigate: {
    label: "Fumigación",
    cost: ECONOMY.fumigationUsd,
    description: "Reduce un 80% el vector ambiental",
  },
  cordon: {
    label: "Cordón sanitario",
    cost: ECONOMY.cordonUsd,
    description: "Reduce un 92% la movilidad · 1 día",
  },
  isolation: {
    label: "Aislamiento de casos",
    cost: ECONOMY.isolationUsd,
    description: "Reduce 50% la transmisión de casos de la zona · 1 día",
  },
  prevention: {
    label: "Prevención comunitaria",
    cost: ECONOMY.preventionUsd,
    description: "Reduce 30% los contagios humanos en la zona · 1 día",
  },
};

export function createGame(config: GameConfig): CureGame {
  if (
    !Number.isInteger(config.vaccineBatchSize ?? ECONOMY.vaccineLotDoses) ||
    (config.vaccineBatchSize ?? ECONOMY.vaccineLotDoses) < 10 ||
    (config.vaccineBatchSize ?? ECONOMY.vaccineLotDoses) > 5000 ||
    !Number.isInteger(config.seed) ||
    config.seed < 0 ||
    config.seed > 4294967295 ||
    !NODE_MAP[config.patientZeroId] ||
    !["standard", "surprise", "escape"].includes(config.scenario) ||
    (config.campaignChapter !== undefined && ![0, 1, 2].includes(config.campaignChapter)) ||
    !BUDGET_LEVELS.some((level) => level === config.dailyBudget)
  )
    throw new Error("Configuración de partida inválida.");
  const params: SimulationParams = {
    ...DEFAULT_SIMULATION_PARAMS,
    seed: config.seed,
    vaccineBatchSize: config.vaccineBatchSize ?? ECONOMY.vaccineLotDoses,
    dailyBudget: config.dailyBudget,
    patientZeroIds: [config.patientZeroId],
    betaHuman: config.scenario === "surprise" ? 0.6 : 0.3,
    betaVector: 0.045,
    vaccineEfficacy: config.scenario === "escape" ? 0.45 : 0.85,
    days: config.campaignChapter === undefined ? MAX_DAYS : CHAPTERS[config.campaignChapter].days,
    monteCarloRuns: 20,
  };
  const initial = runSingleSeirSimulation(
    { ...params, days: 0 },
    "SMART_CORTAFUEGOS",
    0,
    {},
  );
  return {
    config,
    params,
    day: 0,
    research: 0,
    actions: {},
    timeline: initial.timeline,
    status: "playing",
    log: [
      `Brote detectado en ${NODE_MAP[config.patientZeroId].name}. El laboratorio espera tus órdenes.`,
    ],
  };
}

export function getPlanCost(orders: Order[], funding: ResearchFunding): number {
  return (
    funding +
    orders.reduce((sum, order) => sum + INTERVENTIONS[order.kind].cost, 0)
  );
}

export function advanceDay(
  game: CureGame,
  orders: Order[],
  funding: ResearchFunding,
): CureGame {
  if (game.status !== "playing") throw new Error("La partida ya terminó.");
  if (
    !RESEARCH_LEVELS.includes(funding) ||
    orders.some((o) => !NODE_MAP[o.nodeId] || !INTERVENTIONS[o.kind])
  ) {
    throw new Error("Órdenes inválidas.");
  }
  if (getPlanCost(orders, funding) > game.params.dailyBudget)
    throw new Error("Presupuesto insuficiente.");
  if (
    new Set(orders.map((o) => `${o.nodeId}:${o.kind}`)).size !== orders.length
  ) {
    throw new Error(
      "Solo puedes asignar una brigada de cada tipo por zona y día.",
    );
  }
  const previous = game.timeline[game.day];
  const day = game.day + 1;
  const action: DailyAction = {
    day,
    vaccinatedNodes: {},
    fumigatedNodes: [],
    cordonedNodes: [],
    cordonedEdges: [],
    isolatedNodes: [],
    preventionNodes: [],
    budgetSpent: getPlanCost(orders, funding),
    summaryText: `${orders.length} brigadas · $${funding} en investigación`,
  };
  for (const order of orders) {
    if (order.kind === "vaccine") {
      const susceptible = previous.nodes[order.nodeId].S;
      if (susceptible === 0)
        throw new Error(
          "Esta zona no tiene población susceptible para vacunar.",
        );
      action.vaccinatedNodes[order.nodeId] = Math.min(
        susceptible,
        game.params.vaccineBatchSize,
      );
    } else if (order.kind === "fumigate")
      action.fumigatedNodes.push(order.nodeId);
    else if (order.kind === "cordon") action.cordonedNodes.push(order.nodeId);
    else if (order.kind === "isolation") action.isolatedNodes!.push(order.nodeId);
    else action.preventionNodes!.push(order.nodeId);
  }
  action.cordonedEdges = MANTA_EDGES.filter(
    (e) =>
      action.cordonedNodes.includes(e.source) ||
      action.cordonedNodes.includes(e.target),
  ).map((e) => e.id);
  const actions = { ...game.actions, [day]: action };
  // Replay the short decision history so undo-free turns share the seeded SEIR engine, not a second model.
  const run = runSingleSeirSimulation(
    { ...game.params, days: day },
    "SMART_CORTAFUEGOS",
    0,
    actions,
  );
  const snapshot = run.timeline[day];
  const research = Math.min(
    100,
    game.research +
      (funding === ECONOMY.researchPriorityUsd
        ? 5
        : funding === ECONOMY.researchStandardUsd
          ? 3
          : 0),
  );
  const overwhelmed =
    snapshot.cumulativeInfected >= TOTAL_MANTA_POPULATION * LOSS_THRESHOLD;
  const status = overwhelmed
    ? "lost"
    : game.config.campaignChapter !== undefined
      ? campaignStatus(game.config.campaignChapter, day, snapshot, research)
    : research >= 100
      ? "won"
      : day >= MAX_DAYS
        ? "lost"
        : "playing";
  const newCases = snapshot.cumulativeInfected - previous.cumulativeInfected;
  const news =
    status === "won" && game.config.campaignChapter !== undefined
      ? CHAPTERS[game.config.campaignChapter].victory
      : status === "won"
      ? "Cura validada. Manta vuelve a tener futuro."
      : status === "lost"
        ? "La emergencia superó la capacidad de respuesta. La misión termina."
        : snapshot.hospitalCollapsed
          ? "Hospital saturado: la recuperación se ralentiza. Contén los focos."
          : `+${newCases.toLocaleString("es-EC")} nuevos contagios. ${funding ? `Investigación al ${research}%.` : "Investigación detenida: asigna fondos al laboratorio."}`;
  return {
    ...game,
    day,
    actions,
    timeline: run.timeline,
    research,
    status,
    log: [news, ...game.log].slice(0, 20),
  };
}
