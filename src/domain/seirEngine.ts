import { ADJACENCY_LIST, MANTA_NODES, NODE_MAP } from './mantaGraph';
import { createSeededRng, RngFunction, sampleBinomial } from './prng';
import { decideDailyAction } from './strategies';
import {
  CompartmentState,
  DailyCitySnapshot,
  DailyAction,
  DailyNodeSnapshot,
  SimulationParams,
  SingleSimulationRunResult,
  StrategyType,
} from './types';

const FUMIGATION_REDUCTION_ALPHA = 0.80; // alpha_fum = 0.80
const CORDON_REDUCTION_ALPHA = 0.92; // alpha_cierre = 0.92 on inter-barrio transit edges
const CORDON_LOCAL_LOCKDOWN_FACTOR = 0.45; // Local contact reduction inside a cordoned barrio

/**
 * Runs a single stochastic SEIR-V trajectory on the Manta urban graph for a given strategy and runIndex.
 * Strictly enforces the Golden Rule of Vaccination: doses ONLY apply to S_v(t), never to E, I, or R.
 */
export function runSingleSeirSimulation(
  params: SimulationParams,
  strategy: StrategyType,
  runIndex: number,
  manualActions?: Record<number, DailyAction>,
): SingleSimulationRunResult {
  const rng: RngFunction = createSeededRng(params.seed, strategy, runIndex);
  const strategyRng: RngFunction = createSeededRng(
    params.seed ^ 0x13579bdf,
    `${strategy}_DECISION`,
    runIndex,
  );

  // Initialize compartments at Day 0
  const state: Record<string, CompartmentState> = {};
  const patientZeroSet = new Set(params.patientZeroIds.length > 0 ? params.patientZeroIds : ['N01']);

  let initialCumulativeInfected = 0;

  for (const node of MANTA_NODES) {
    const isPatientZero = patientZeroSet.has(node.id);
    const i0 = isPatientZero ? Math.min(node.population, params.initialInfectedPerNode) : 0;
    const e0 = isPatientZero ? Math.min(node.population - i0, params.initialExposedPerNode) : 0;
    const s0 = node.population - i0 - e0;
    initialCumulativeInfected += i0 + e0;

    state[node.id] = {
      S: s0,
      E: e0,
      I: i0,
      R: 0,
      // Vector index starts active in Patient Zero nodes and dormant elsewhere until zombies arrive
      vectorIndex: isPatientZero ? node.baseVectorRisk : node.baseVectorRisk * 0.25,
    };
  }

  const timeline: DailyCitySnapshot[] = [];
  let cumulativeInfected = initialCumulativeInfected;
  let peakZombies = 0;
  let peakDay = 0;
  let totalVaccinesUsed = 0;
  const wastedDosesOnInfected = 0; // Enforced mathematically by S-only allocation
  let totalBudgetSpent = 0;
  let hospitalCollapseDays = 0;

  for (let day = 0; day <= params.days; day++) {
    // 1. Decide Phase A interventions for today
    const action = manualActions || day === 0
      ? manualActions?.[day] ?? {
          day, vaccinatedNodes: {}, fumigatedNodes: [], cordonedNodes: [],
          cordonedEdges: [], budgetSpent: 0, summaryText: 'Sin intervención.',
        }
      : decideDailyAction(day, state, params, strategy, strategyRng);
    totalBudgetSpent += action.budgetSpent;

    const cordonedNodeSet = new Set(action.cordonedNodes);
    const cordonedEdgeSet = new Set(action.cordonedEdges);
    const fumigatedNodeSet = new Set(action.fumigatedNodes);

    // Phase A: Apply Interventions (Vaccines strictly on S, Fumigation on vectorIndex)
    const vaccinatedTodayByNode: Record<string, number> = {};
    for (const node of MANTA_NODES) {
      const nodeState = state[node.id];
      const assignedDoses = Math.max(0, Math.floor(action.vaccinatedNodes[node.id] ?? 0));

      // GOLDEN RULE: Cap doses at current Susceptible count S_v(t) so 0 doses are ever wasted on E, I, or R
      const eligibleDoses = Math.min(nodeState.S, assignedDoses);
      if (eligibleDoses > 0) {
        const immunizedCount = Math.min(
          nodeState.S,
          sampleBinomial(eligibleDoses, params.vaccineEfficacy, rng),
        );
        nodeState.S -= immunizedCount;
        nodeState.R += immunizedCount;
        vaccinatedTodayByNode[node.id] = immunizedCount;
        totalVaccinesUsed += eligibleDoses;
      } else {
        vaccinatedTodayByNode[node.id] = 0;
      }

      if (fumigatedNodeSet.has(node.id)) {
        nodeState.vectorIndex = nodeState.vectorIndex * (1 - FUMIGATION_REDUCTION_ALPHA);
      }
    }

    // Compute current city totals before Phase D transition
    let currentTotalI = 0;
    for (const node of MANTA_NODES) {
      currentTotalI += state[node.id].I;
    }

    // Phase C: Hospital Rodríguez Zambrano collapse threshold
    const hospitalCollapsed = currentTotalI > params.hospitalCapacity;
    if (hospitalCollapsed) {
      hospitalCollapseDays += 1;
    }
    const effectiveGamma =
      currentTotalI <= params.hospitalCapacity || currentTotalI === 0
        ? params.gamma
        : params.gamma * (params.hospitalCapacity / currentTotalI);

    // Snapshot states prior to daily synchronous transitions
    const prevS: Record<string, number> = {};
    const prevE: Record<string, number> = {};
    const prevI: Record<string, number> = {};
    const prevR: Record<string, number> = {};
    const prevW: Record<string, number> = {};

    for (const node of MANTA_NODES) {
      const st = state[node.id];
      prevS[node.id] = st.S;
      prevE[node.id] = st.E;
      prevI[node.id] = st.I;
      prevR[node.id] = st.R;
      prevW[node.id] = st.vectorIndex;
    }

    const dailyNodes: Record<string, DailyNodeSnapshot> = {};
    let dayTotalS = 0;
    let dayTotalE = 0;
    let dayTotalI = 0;
    let dayTotalR = 0;

    // Phase B & Phase D: Force of Infection & Seeded Binomial Transitions
    for (const node of MANTA_NODES) {
      const vId = node.id;
      const nPop = node.population;
      const sNow = prevS[vId];
      const eNow = prevE[vId];
      const iNow = prevI[vId];
      const rNow = prevR[vId];
      const wNow = prevW[vId];

      // Neighbor graph contagion sum across urban bus corridors
      let importedContagion = 0;
      const neighbors = ADJACENCY_LIST[vId] ?? [];
      for (const link of neighbors) {
        const uId = link.neighborId;
        const uNode = NODE_MAP[uId];
        const iNeighbor = prevI[uId];
        if (iNeighbor <= 0) continue;

        const isEdgeCordoned =
          cordonedEdgeSet.has(link.edgeId) || cordonedNodeSet.has(vId) || cordonedNodeSet.has(uId);
        const effectiveWeight = isEdgeCordoned
          ? link.weight * (1 - CORDON_REDUCTION_ALPHA)
          : link.weight;

        importedContagion += effectiveWeight * (iNeighbor / uNode.population);
      }

      const isLocallyCordoned = cordonedNodeSet.has(vId);
      const localContagion =
        (iNow / nPop) * (isLocallyCordoned ? CORDON_LOCAL_LOCKDOWN_FACTOR : 1.0);

      // Necro-Dengue environmental vector amplifies contagion proportional to local/imported pathogen reservoir
      const activePathogenPressure = localContagion + importedContagion;
      const vectorActivation =
        activePathogenPressure > 0
          ? activePathogenPressure / (activePathogenPressure + 0.018)
          : 0;

      const lambdaV =
        params.betaHuman * (localContagion + importedContagion) +
        params.betaVector * wNow * vectorActivation;

      const pInf = 1 - Math.exp(-Math.max(0, lambdaV));
      const pIncubationEnd = 1 - Math.exp(-Math.max(0, params.sigma));
      const pRecovery = 1 - Math.exp(-Math.max(0, effectiveGamma));

      // Day 0 records initial condition before stepping to Day 1
      let deltaE = 0;
      let deltaI = 0;
      let deltaR = 0;

      if (day > 0) {
        deltaE = sampleBinomial(sNow, pInf, rng);
        deltaI = sampleBinomial(eNow, pIncubationEnd, rng);
        deltaR = sampleBinomial(iNow, pRecovery, rng);
      }

      const nextS = sNow - deltaE;
      const nextE = eNow + deltaE - deltaI;
      const nextI = iNow + deltaI - deltaR;
      const nextR = rNow + deltaR;

      // Environmental vector dynamics: rebounds toward baseVectorRisk when local zombies exist
      const zombiePrevalence = nextI / nPop;
      const naturalGrowth =
        zombiePrevalence > 0.0005
          ? 0.14 * (node.baseVectorRisk - wNow) + 0.4 * zombiePrevalence * node.baseVectorRisk
          : -0.04 * wNow;
      const nextW = Math.max(0, Math.min(1, wNow + naturalGrowth));

      state[vId] = {
        S: nextS,
        E: nextE,
        I: nextI,
        R: nextR,
        vectorIndex: nextW,
      };

      cumulativeInfected += deltaE;

      dayTotalS += nextS;
      dayTotalE += nextE;
      dayTotalI += nextI;
      dayTotalR += nextR;

      dailyNodes[vId] = {
        nodeId: vId,
        S: nextS,
        E: nextE,
        I: nextI,
        R: nextR,
        vectorIndex: Number(nextW.toFixed(4)),
        newExposed: deltaE,
        newInfected: deltaI,
        newRecovered: deltaR,
        vaccinatedToday: vaccinatedTodayByNode[vId] ?? 0,
        fumigatedToday: fumigatedNodeSet.has(vId),
        cordonedToday: cordonedNodeSet.has(vId),
      };
    }

    if (dayTotalI > peakZombies) {
      peakZombies = dayTotalI;
      peakDay = day;
    }

    timeline.push({
      day,
      totalS: dayTotalS,
      totalE: dayTotalE,
      totalI: dayTotalI,
      totalR: dayTotalR,
      cumulativeInfected,
      effectiveGamma: Number(effectiveGamma.toFixed(4)),
      hospitalCollapsed,
      nodes: dailyNodes,
      action,
    });
  }

  return {
    strategy,
    runIndex,
    seedUsed: params.seed,
    timeline,
    peakZombies,
    peakDay,
    totalCumulativeInfected: cumulativeInfected,
    totalVaccinesUsed,
    wastedDosesOnInfected,
    totalBudgetSpent,
    hospitalCollapseDays,
  };
}
