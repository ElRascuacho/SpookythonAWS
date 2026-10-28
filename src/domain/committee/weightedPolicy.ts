import { ADJACENCY_LIST, MANTA_EDGES, MANTA_NODES, NODE_MAP } from '../mantaGraph';
import type { CompartmentState, DailyAction, SimulationParams } from '../types';
import type { PolicyWeights } from './types';

interface CandidateAction {
  kind: 'CORDON' | 'FUMIGATE' | 'VACCINATE';
  nodeId: string;
  cost: number;
  rcdScore: number; // Ratio de Contención por Dólar
  label: string;
}

/**
 * Decides daily epidemiological actions based on an explainable 4-weight policy vector:
 * w = [w_cordon_early, w_fumigation_early, w_cordon_late, w_fumigation_late]
 *
 * Rules per algorithm.md §2:
 * - Multiplier: exp(w_i)
 * - Vaccine: factor relative 1 (unlearned)
 * - Zero-vector [0, 0, 0, 0] strictly matches source SGC
 * - Product early cutoff: earlyLastDay = Math.floor(0.45 * H), where H = params.days
 * - SGC candidate generation rules (thresholds, caps, costs, and stable tie-breaking) preserved
 */
export function decideWeightedAction(
  day: number,
  state: Record<string, CompartmentState>,
  params: SimulationParams,
  weights: readonly number[] | PolicyWeights,
): DailyAction {
  if (day === 0 || params.dailyBudget <= 0) {
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
          : 'Presupuesto municipal agotado o nulo.',
    };
  }

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

  // Weight multipliers by early/late product cutoff: earlyLastDay = floor(0.45 * H)
  const earlyLastDay = Math.floor(0.45 * params.days);
  const offset = day <= earlyLastDay ? 0 : 2;
  for (const candidate of candidates) {
    if (candidate.kind === 'CORDON') {
      candidate.rcdScore *= Math.exp(weights[offset]);
    } else if (candidate.kind === 'FUMIGATE') {
      candidate.rcdScore *= Math.exp(weights[offset + 1]);
    }
    // Vaccine factor remains constant 1 (unlearned)
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

/**
 * Creates a reusable policy decision callback for the SEIR simulation engine (SingleSimulationOptions.onDailyDecision).
 */
export function createWeightedPolicy(
  weights: readonly number[] | PolicyWeights,
): (day: number, state: Record<string, CompartmentState>, params: SimulationParams) => DailyAction {
  return (day, state, params) => decideWeightedAction(day, state, params, weights);
}
