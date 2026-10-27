import { AIPolicySpec } from "../../src/domain/schemas/aiPolicy.schema";
import { DailyAction, SimulationParams } from "../../src/domain/types";
import { MANTA_NODES, NODE_MAP, ADJACENCY_LIST } from "../../src/domain/mantaGraph";

export interface NodeStateSnapshot {
  S: number;
  E: number;
  I: number;
  R: number;
  vectorIndex: number;
}

export interface InterpretPolicyInput {
  day: number;
  policy: AIPolicySpec;
  nodeStates: Record<string, NodeStateSnapshot>;
  params: SimulationParams;
}

export function interpretAiPolicyDailyAction(input: InterpretPolicyInput): DailyAction {
  const { day, policy, nodeStates, params } = input;
  let remainingTotalBudget = params.dailyBudget;

  const vaccineBudgetCap = Math.floor(params.dailyBudget * policy.budgetAllocation.vaccineRatio);
  const fumigationBudgetCap = Math.floor(params.dailyBudget * policy.budgetAllocation.fumigationRatio);
  const cordonBudgetCap = Math.floor(params.dailyBudget * policy.budgetAllocation.cordonRatio);

  let currentVaccineBudget = vaccineBudgetCap;
  let currentFumigationBudget = fumigationBudgetCap;
  let currentCordonBudget = cordonBudgetCap;

  // 1. Sort nodes according to priority rule
  const nodes = [...MANTA_NODES];
  nodes.sort((a, b) => {
    const stateA = nodeStates[a.id] || { S: a.population, E: 0, I: 0, R: 0, vectorIndex: a.baseVectorRisk };
    const stateB = nodeStates[b.id] || { S: b.population, E: 0, I: 0, R: 0, vectorIndex: b.baseVectorRisk };

    switch (policy.nodePriorityRule) {
      case "HIGHEST_INFECTED_FIRST":
        return stateB.I - stateA.I || a.id.localeCompare(b.id);
      case "HIGHEST_VECTOR_FIRST":
        return stateB.vectorIndex - stateA.vectorIndex || a.id.localeCompare(b.id);
      case "HIGHEST_BETWEENNESS_FIRST":
        return b.betweenness - a.betweenness || a.id.localeCompare(b.id);
      case "CRITICAL_HEALTH_FIRST": {
        const isCriticalA = a.category === "Salud Crítica" || a.id === "N04" ? 1 : 0;
        const isCriticalB = b.category === "Salud Crítica" || b.id === "N04" ? 1 : 0;
        return isCriticalB - isCriticalA || stateB.I - stateA.I;
      }
      default:
        return stateB.I - stateA.I || a.id.localeCompare(b.id);
    }
  });

  const vaccinatedNodes: Record<string, number> = {};
  const fumigatedNodes: string[] = [];
  const cordonedNodes: string[] = [];
  const cordonedEdges: string[] = [];

  let totalSpent = 0;

  // 2. Assign Vaccinations (Golden Rule: ONLY vaccinate Susceptibles S)
  for (const node of nodes) {
    if (
      currentVaccineBudget >= params.vaccineCost &&
      totalSpent + params.vaccineCost <= params.dailyBudget
    ) {
      const state = nodeStates[node.id];
      if (state && state.S >= policy.minSusceptibleToVaccinate) {
        const doses = Math.min(state.S, params.vaccineBatchSize);
        if (doses > 0) {
          vaccinatedNodes[node.id] = doses;
          currentVaccineBudget -= params.vaccineCost;
          totalSpent += params.vaccineCost;
        }
      }
    }
  }

  // 3. Assign Vector Fumigations
  const vectorRanked = [...nodes].sort((a, b) => {
    const vA = nodeStates[a.id]?.vectorIndex ?? a.baseVectorRisk;
    const vB = nodeStates[b.id]?.vectorIndex ?? b.baseVectorRisk;
    return vB - vA;
  });

  for (const node of vectorRanked) {
    if (
      currentFumigationBudget >= params.fumigationCost &&
      totalSpent + params.fumigationCost <= params.dailyBudget
    ) {
      const vectorVal = nodeStates[node.id]?.vectorIndex ?? node.baseVectorRisk;
      if (vectorVal >= policy.vectorThresholdToFumigate) {
        fumigatedNodes.push(node.id);
        currentFumigationBudget -= params.fumigationCost;
        totalSpent += params.fumigationCost;
      }
    }
  }

  // 4. Assign Sanitary Cordons
  for (const node of nodes) {
    if (
      currentCordonBudget >= params.cordonCost &&
      totalSpent + params.cordonCost <= params.dailyBudget
    ) {
      const state = nodeStates[node.id];
      if (state && state.I > 0) {
        cordonedNodes.push(node.id);
        currentCordonBudget -= params.cordonCost;
        totalSpent += params.cordonCost;

        // Cordon adjacent transit edges
        const neighbors = ADJACENCY_LIST[node.id] || [];
        for (const link of neighbors) {
          if (!cordonedEdges.includes(link.edgeId)) {
            cordonedEdges.push(link.edgeId);
          }
        }
      }
    }
  }

  const summaryParts: string[] = [];
  if (Object.keys(vaccinatedNodes).length > 0) {
    summaryParts.push(
      `Vacunación en ${Object.keys(vaccinatedNodes)
        .map((id) => NODE_MAP[id]?.name || id)
        .join(", ")}`,
    );
  }
  if (fumigatedNodes.length > 0) {
    summaryParts.push(
      `Fumigación en ${fumigatedNodes.map((id) => NODE_MAP[id]?.name || id).join(", ")}`,
    );
  }
  if (cordonedNodes.length > 0) {
    summaryParts.push(
      `Cordón en ${cordonedNodes.map((id) => NODE_MAP[id]?.name || id).join(", ")}`,
    );
  }

  const summaryText =
    summaryParts.length > 0
      ? `Día ${day} [Política IA]: ${summaryParts.join(" | ")} ($${totalSpent} invertidos).`
      : `Día ${day} [Política IA]: Monitoreo pasivo sin intervenciones asignadas ($0 gastados).`;

  return {
    day,
    vaccinatedNodes,
    fumigatedNodes,
    cordonedNodes,
    cordonedEdges,
    budgetSpent: totalSpent,
    summaryText,
  };
}
