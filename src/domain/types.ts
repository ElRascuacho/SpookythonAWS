export type NodeCategory =
  | 'Comercial / Mercado'
  | 'Pesquero / Mercado'
  | 'Educación Superior'
  | 'Salud Crítica'
  | 'Transporte Masivo'
  | 'Comercial / Recreación'
  | 'Administrativo'
  | 'Residencial Denso'
  | 'Residencial / Industrial'
  | 'Periférico / Pesquero'
  | 'Turístico / Residencial'
  | 'Educación Secundaria'
  | 'Industrial'
  | 'Residencial'
  | 'Logístico / Portuario';

export interface CityNode {
  id: string;
  name: string;
  category: NodeCategory;
  lat: number;
  lng: number;
  population: number;
  baseVectorRisk: number;
  betweenness: number;
  roleDescription: string;
}

export interface CityEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  routeLabel: string;
}

export interface CompartmentState {
  S: number; // Sanos (Susceptibles)
  E: number; // Mordidos (Expuestos en incubación)
  I: number; // Zombies (Infecciosos activos)
  R: number; // Exorcizados / Inmunizados
  vectorIndex: number; // W_v(t) in [0, 1]
}

export type StrategyType = 'NO_INTERVENTION' | 'RANDOM' | 'SMART_CORTAFUEGOS';

export interface SimulationParams {
  betaHuman: number; // Tasa de transmisión humano-zombie (default: 0.35)
  betaVector: number; // Tasa de transmisión por foco vectorial Necro-Dengue (default: 0.12)
  sigma: number; // Tasa de fin de incubación E -> I (default: 0.33)
  gamma: number; // Tasa base de rehabilitación/exorcismo I -> R (default: 0.10)
  hospitalCapacity: number; // Capacidad crítica Hospital Rodríguez Zambrano (default: 2500)
  vaccineEfficacy: number; // Efectividad de la vacuna eta (default: 0.85)
  dailyBudget: number; // Presupuesto diario del Comité B_t (default: 1000)
  vaccineCost: number; // Costo por lote de 500 dosis (default: 200)
  vaccineBatchSize: number; // Tamaño del lote de vacunas por unidad de compra (default: 500)
  fumigationCost: number; // Costo de fumigar un nodo (default: 250)
  cordonCost: number; // Costo de cordón sanitario en un nodo/corredor (default: 300)
  days: number; // Horizonte de simulación T (default: 60)
  seed: number; // Semilla entera 32-bit reproducible (default: 20261030)
  monteCarloRuns: number; // Número de corridas Monte Carlo M (default: 80 en UI, 200 en Lambda)
  patientZeroIds: string[]; // IDs de nodos donde inicia el brote (default: ['N01'])
  initialInfectedPerNode: number; // Casos iniciales por nodo Paciente Cero (default: 35)
  initialExposedPerNode: number; // Expuestos iniciales por nodo Paciente Cero (default: 50)
}

export interface DailyAction {
  isolatedNodes?: string[];
  preventionNodes?: string[];
  day: number;
  vaccinatedNodes: Record<string, number>; // nodeId -> doses administered ONLY to S
  fumigatedNodes: string[]; // nodeIds receiving vector brigade
  cordonedNodes: string[]; // nodeIds with active sanitary cordon
  cordonedEdges: string[]; // edgeIds with active transport closure
  budgetSpent: number;
  summaryText: string;
}

export interface DailyNodeSnapshot {
  nodeId: string;
  S: number;
  E: number;
  I: number;
  R: number;
  vectorIndex: number;
  newExposed: number;
  newInfected: number;
  newRecovered: number;
  vaccinatedToday: number;
  fumigatedToday: boolean;
  cordonedToday: boolean;
}

export interface DailyCitySnapshot {
  day: number;
  totalS: number;
  totalE: number;
  totalI: number;
  totalR: number;
  cumulativeInfected: number;
  effectiveGamma: number;
  hospitalCollapsed: boolean;
  nodes: Record<string, DailyNodeSnapshot>;
  action: DailyAction;
}

export interface SingleSimulationRunResult {
  strategy: StrategyType;
  runIndex: number;
  seedUsed: number;
  timeline: DailyCitySnapshot[];
  peakZombies: number;
  peakDay: number;
  totalCumulativeInfected: number;
  totalVaccinesUsed: number;
  wastedDosesOnInfected: number; // Must strictly equal 0
  totalBudgetSpent: number;
  hospitalCollapseDays: number;
}

export interface DailyBandPoint {
  day: number;
  meanActiveZombies: number;
  p10ActiveZombies: number;
  p90ActiveZombies: number;
  meanExposed: number;
  meanSusceptible: number;
  meanRecovered: number;
  meanCumulativeInfected: number;
  p10CumulativeInfected: number;
  p90CumulativeInfected: number;
}

export interface StrategyMonteCarloSummary {
  strategy: StrategyType;
  label: string;
  dailyBands: DailyBandPoint[];
  representativeRun: SingleSimulationRunResult; // Run 0 for 3D map playback and detailed inspection
  meanTotalInfected: number;
  p10TotalInfected: number;
  p90TotalInfected: number;
  stdDevTotalInfected: number;
  meanPeakZombies: number;
  p10PeakZombies: number;
  p90PeakZombies: number;
  /** Legacy wire names: these metrics count infections avoided, not lives or deaths. */
  meanLivesSavedVsBaseline: number;
  p10LivesSavedVsBaseline: number;
  p90LivesSavedVsBaseline: number;
  meanHospitalCollapseDays: number;
  meanBudgetSpent: number;
  costPerLifeSaved: number;
  zeroWastedVaccinesVerified: boolean;
}

export interface MonteCarloComparisonResult {
  params: SimulationParams;
  computedAtIso: string;
  executionTimeMs: number;
  totalPopulation: number;
  strategies: Record<StrategyType, StrategyMonteCarloSummary>;
}
