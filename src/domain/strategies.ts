import { ADJACENCY_LIST as DEFAULT_ADJACENCY_LIST, MANTA_EDGES as DEFAULT_EDGES, MANTA_NODES as DEFAULT_NODES, NODE_MAP as DEFAULT_NODE_MAP } from './mantaGraph';
import { RngFunction } from './prng';
import { CompartmentState, DailyAction, SimulationParams, StrategyType } from './types';
import type { DifficultyGraph } from './difficultyGraph';

interface CandidateAction {
  kind: 'CORDON' | 'FUMIGATE' | 'VACCINATE';
  nodeId: string;
  cost: number;
  rcdScore: number; // Ratio de Contención por Dólar
  label: string;
}

/**
 * Decides the daily epidemiological interventions for day `day` given the current graph state and budget.
 */
export function decideDailyAction(
  day: number,
  state: Record<string, CompartmentState>,
  params: SimulationParams,
  strategy: StrategyType,
  rng: RngFunction,
  graph?: DifficultyGraph,
): DailyAction {
  if (strategy === 'NO_INTERVENTION' || day === 0 || params.dailyBudget <= 0) {
    return {
      day,
      vaccinatedNodes: {},
      fumigatedNodes: [],
      cordonedNodes: [],
      cordonedEdges: [],
      budgetSpent: 0,
      summaryText:
        day === 0
          ? 'Día 0: Detección del Paciente Cero en Manta. Monitoreo epidemiológico activado.'
          : 'Sin intervención municipal (Línea Base 1).',
    };
  }

  if (strategy === 'RANDOM') {
    return decideRandomAction(day, state, params, rng, graph);
  }

  return decideSmartCortafuegosAction(day, state, params, graph);
}

/**
 * Baseline 2: Random allocation of daily budget across nodes without graph topology intelligence.
 */
function decideRandomAction(
  day: number,
  state: Record<string, CompartmentState>,
  params: SimulationParams,
  rng: RngFunction,
  graph?: DifficultyGraph,
): DailyAction {
  const MANTA_NODES = graph?.nodes ?? DEFAULT_NODES;
  const MANTA_EDGES = graph?.edges ?? DEFAULT_EDGES;
  let remainingBudget = params.dailyBudget;
  const vaccinatedNodes: Record<string, number> = {};
  const fumigatedNodes: string[] = [];
  const cordonedNodes: string[] = [];
  const minCost = Math.min(params.vaccineCost, params.fumigationCost, params.cordonCost);

  let safetyCounter = 0;
  while (remainingBudget >= minCost && safetyCounter < 25) {
    safetyCounter++;
    const randomNode = MANTA_NODES[Math.floor(rng() * MANTA_NODES.length)];
    const nodeState = state[randomNode.id];
    const roll = rng();

    if (
      roll < 0.34 &&
      remainingBudget >= params.vaccineCost &&
      nodeState.S >= params.vaccineBatchSize * 0.25
    ) {
      const doses = Math.min(
        nodeState.S - (vaccinatedNodes[randomNode.id] ?? 0),
        params.vaccineBatchSize,
      );
      if (doses > 0) {
        vaccinatedNodes[randomNode.id] = (vaccinatedNodes[randomNode.id] ?? 0) + doses;
        remainingBudget -= params.vaccineCost;
      }
    } else if (
      roll < 0.67 &&
      remainingBudget >= params.fumigationCost &&
      !fumigatedNodes.includes(randomNode.id)
    ) {
      fumigatedNodes.push(randomNode.id);
      remainingBudget -= params.fumigationCost;
    } else if (
      remainingBudget >= params.cordonCost &&
      !cordonedNodes.includes(randomNode.id)
    ) {
      cordonedNodes.push(randomNode.id);
      remainingBudget -= params.cordonCost;
    }
  }

  const cordonedEdges = MANTA_EDGES.filter(
    (e) => cordonedNodes.includes(e.source) || cordonedNodes.includes(e.target),
  ).map((e) => e.id);

  const budgetSpent = params.dailyBudget - remainingBudget;
  return {
    day,
    vaccinatedNodes,
    fumigatedNodes,
    cordonedNodes,
    cordonedEdges,
    budgetSpent,
    summaryText: `Día ${day} (Azar): $${budgetSpent} gastados sin priorización topológica.`,
  };
}

/**
 * Winning Strategy: Smart Graph Cortafuegos (SGC).
 * Ranks all candidate interventions by Containment Ratio per Dollar (RCD):
 *   RCD(a) = [Expected Cases Prevented in 2 Hops(a) * (1 + Betweenness(v))] / Cost(a)
 * Balances:
 * 1. Precision Cordon on the top active outbreak source(s) to cut graph export.
 * 2. Targeted Fumigation where active pathogen + high Necro-Dengue vector coexist.
 * 3. Ring Vaccination on high-betweenness bridge hubs & threatened neighbors.
 */
function decideSmartCortafuegosAction(
  day: number,
  state: Record<string, CompartmentState>,
  params: SimulationParams,
  graph?: DifficultyGraph,
): DailyAction {
  const MANTA_NODES = graph?.nodes ?? DEFAULT_NODES;
  const MANTA_EDGES = graph?.edges ?? DEFAULT_EDGES;
  const NODE_MAP = graph?.nodeMap ?? DEFAULT_NODE_MAP;
  const ADJACENCY_LIST = graph?.adjacencyList ?? DEFAULT_ADJACENCY_LIST;
  let remainingBudget = params.dailyBudget;
  const vaccinatedNodes: Record<string, number> = {};
  const fumigatedNodes: string[] = [];
  const cordonedNodes: string[] = [];

  let totalCityI = 0;
  for (const node of MANTA_NODES) {
    totalCityI += state[node.id].I;
  }
  const hospitalLoadRatio = totalCityI / Math.max(1, params.hospitalCapacity);
  const emergencyMode = hospitalLoadRatio >= 0.65;

  const candidates: CandidateAction[] = [];

  for (const node of MANTA_NODES) {
    const vId = node.id;
    const st = state[vId];
    const neighbors = ADJACENCY_LIST[vId] ?? [];
    const activeThreatInNode = st.I + 0.7 * st.E;
    const localPrevalence = activeThreatInNode / node.population;

    let outgoingFlowToSusceptibles = 0;
    let incomingThreatFromNeighbors = 0;

    for (const link of neighbors) {
      const uNode = NODE_MAP[link.neighborId];
      const uState = state[link.neighborId];
      const uSusceptibleRatio = uState.S / uNode.population;
      outgoingFlowToSusceptibles +=
        link.weight * uSusceptibleRatio * (1 + uNode.betweenness);

      const uActiveThreat = (uState.I + 0.6 * uState.E) / uNode.population;
      incomingThreatFromNeighbors += link.weight * uActiveThreat;
    }

    // 1. Candidate: CORDON SANITARIO on primary outbreak hub (cerco al foco)
    if (params.cordonCost > 0 && activeThreatInNode >= 8 && st.S > 400) {
      const expectedExportedCases =
        params.betaHuman *
        activeThreatInNode *
        (1.4 * (st.S / node.population) + 2.2 * outgoingFlowToSusceptibles);
      const earlyOutbreakMultiplier = day <= 18 ? 2.6 : emergencyMode ? 2.0 : 1.4;
      const rcdCordon =
        (expectedExportedCases * (1 + node.betweenness) * earlyOutbreakMultiplier) /
        params.cordonCost;

      candidates.push({
        kind: 'CORDON',
        nodeId: vId,
        cost: params.cordonCost,
        rcdScore: rcdCordon,
        label: `🚧 Cordón en ${node.name}`,
      });
    }

    // 2. Candidate: FUMIGACIÓN VECTORIAL on active high-vector nodes
    if (
      params.fumigationCost > 0 &&
      st.vectorIndex > 0.35 &&
      (activeThreatInNode >= 10 || incomingThreatFromNeighbors > 0.004) &&
      st.S > 1000
    ) {
      const pathogenPresence = Math.min(1, (localPrevalence + incomingThreatFromNeighbors) * 25);
      const expectedVectorCasesAvoided =
        params.betaVector * 0.80 * st.vectorIndex * pathogenPresence * 650;
      const rcdFumigate =
        (expectedVectorCasesAvoided * (1 + node.betweenness)) / params.fumigationCost;

      candidates.push({
        kind: 'FUMIGATE',
        nodeId: vId,
        cost: params.fumigationCost,
        rcdScore: rcdFumigate,
        label: `🌫️ Fumigación en ${node.name}`,
      });
    }

    // 3. Candidate: RING VACCINATION on high-betweenness hubs & neighbors of infected nodes
    if (params.vaccineCost > 0 && st.S >= 200) {
      const ringPressure = incomingThreatFromNeighbors * 28 + localPrevalence * 14;
      const hubStrategicValue = (0.35 + ringPressure) * (1 + node.betweenness * 1.4);

      for (let batch = 1; batch <= 3; batch++) {
        const availableS = st.S - (batch - 1) * params.vaccineBatchSize;
        if (availableS <= 150) break;
        const effectiveDoses = Math.min(availableS, params.vaccineBatchSize);
        const batchDecay = batch === 1 ? 1.0 : batch === 2 ? 0.78 : 0.58;
        const expectedProtected =
          effectiveDoses * 0.22 * params.vaccineEfficacy * hubStrategicValue * batchDecay;
        const rcdVaccine =
          (expectedProtected * (1 + node.betweenness)) / params.vaccineCost;

        candidates.push({
          kind: 'VACCINATE',
          nodeId: vId,
          cost: params.vaccineCost,
          rcdScore: rcdVaccine,
          label: `💉 Vacunar ${effectiveDoses} sanos en ${node.name}`,
        });
      }
    }
  }

  // Sort all candidate actions descending by RCD (Containment Ratio per Dollar)
  candidates.sort((a, b) => b.rcdScore - a.rcdScore);

  // Cap daily cordons & fumigations so at least 40-60% of budget builds permanent immunity (S -> R)
  const maxCordonsPerDay = emergencyMode ? 2 : 1;
  const maxFumigationsPerDay = 1;

  const chosenLabels: string[] = [];

  for (const cand of candidates) {
    if (cand.cost > remainingBudget) continue;

    if (cand.kind === 'CORDON') {
      if (cordonedNodes.length >= maxCordonsPerDay || cordonedNodes.includes(cand.nodeId)) continue;
      cordonedNodes.push(cand.nodeId);
      remainingBudget -= cand.cost;
      chosenLabels.push(cand.label);
    } else if (cand.kind === 'FUMIGATE') {
      if (fumigatedNodes.length >= maxFumigationsPerDay || fumigatedNodes.includes(cand.nodeId))
        continue;
      fumigatedNodes.push(cand.nodeId);
      remainingBudget -= cand.cost;
      chosenLabels.push(cand.label);
    } else if (cand.kind === 'VACCINATE') {
      const currentAssigned = vaccinatedNodes[cand.nodeId] ?? 0;
      const availableSusceptibles = state[cand.nodeId].S - currentAssigned;
      if (availableSusceptibles <= 0) continue;

      const dosesToAdd = Math.min(availableSusceptibles, params.vaccineBatchSize);
      vaccinatedNodes[cand.nodeId] = currentAssigned + dosesToAdd;
      remainingBudget -= cand.cost;
      chosenLabels.push(`💉 ${dosesToAdd} dosis en ${NODE_MAP[cand.nodeId].name}`);
    }
  }

  const cordonedEdges = MANTA_EDGES.filter(
    (e) => cordonedNodes.includes(e.source) || cordonedNodes.includes(e.target),
  ).map((e) => e.id);

  const budgetSpent = params.dailyBudget - remainingBudget;
  const summaryText =
    chosenLabels.length > 0
      ? `Día ${day}: ${chosenLabels.slice(0, 3).join(' | ')}${chosenLabels.length > 3 ? ` (+${chosenLabels.length - 3} acciones)` : ''}`
      : `Día ${day}: Vigilancia epidemiológica activa.`;

  return {
    day,
    vaccinatedNodes,
    fumigatedNodes,
    cordonedNodes,
    cordonedEdges,
    budgetSpent,
    summaryText,
  };
}
