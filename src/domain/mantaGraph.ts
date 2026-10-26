import { CityEdge, CityNode, SimulationParams } from './types';

/**
 * 16 Strategic Nodes of Manta, Manabí, Ecuador calibrated with demographic proportions (INEC / GAD Manta).
 */
export const MANTA_NODES: CityNode[] = [
  {
    id: 'N01',
    name: 'Mercado Central de Tarqui',
    category: 'Comercial / Mercado',
    lat: -0.9585,
    lng: -80.7089,
    population: 18000,
    baseVectorRisk: 0.85,
    betweenness: 0.94,
    roleDescription: 'Super-propagador comercial; altísimo grado de conexión hacia todos los corredores.',
  },
  {
    id: 'N02',
    name: 'Playita Mía (Tarqui)',
    category: 'Pesquero / Mercado',
    lat: -0.9512,
    lng: -80.7095,
    population: 12000,
    baseVectorRisk: 0.90,
    betweenness: 0.62,
    roleDescription: 'Foco costero y comercial de madrugada; alta humedad y presencia del vector Necro-Dengue.',
  },
  {
    id: 'N03',
    name: 'ULEAM (Campus Principal)',
    category: 'Educación Superior',
    lat: -0.9531,
    lng: -80.7456,
    population: 22000,
    baseVectorRisk: 0.40,
    betweenness: 0.89,
    roleDescription: 'Hub estudiantil; conecta jóvenes de todos los barrios residenciales de Manta.',
  },
  {
    id: 'N04',
    name: 'Hospital Rodríguez Zambrano',
    category: 'Salud Crítica',
    lat: -0.9628,
    lng: -80.7412,
    population: 6000,
    baseVectorRisk: 0.25,
    betweenness: 0.58,
    roleDescription: 'Nodo crítico de salud; recibe flujo de infectados y define el umbral de colapso hospitalario.',
  },
  {
    id: 'N05',
    name: 'Terminal Terrestre de Manta',
    category: 'Transporte Masivo',
    lat: -0.9689,
    lng: -80.6892,
    population: 15000,
    baseVectorRisk: 0.50,
    betweenness: 0.78,
    roleDescription: 'Puerta de entrada/salida y nodo puente hacia Eloy Alfaro, Los Esteros y Zona Industrial.',
  },
  {
    id: 'N06',
    name: 'Mall del Pacífico / Murciélago',
    category: 'Comercial / Recreación',
    lat: -0.9425,
    lng: -80.7314,
    population: 16000,
    baseVectorRisk: 0.20,
    betweenness: 0.64,
    roleDescription: 'Concentrador de alto flujo vespertino, turístico y de fines de semana.',
  },
  {
    id: 'N07',
    name: 'Centro de Manta (Av. 2 / Banco)',
    category: 'Administrativo',
    lat: -0.9478,
    lng: -80.7225,
    population: 19000,
    baseVectorRisk: 0.45,
    betweenness: 0.91,
    roleDescription: 'Puente central entre el oeste (ULEAM/Barbasquillo) y el este (Tarqui/Esteros).',
  },
  {
    id: 'N08',
    name: 'Parroquia Eloy Alfaro (Cuba)',
    category: 'Residencial Denso',
    lat: -0.9810,
    lng: -80.6980,
    population: 35000,
    baseVectorRisk: 0.75,
    betweenness: 0.82,
    roleDescription: 'Alta densidad habitacional; principal origen de trabajadores hacia mercados y centro.',
  },
  {
    id: 'N09',
    name: 'Parroquia Los Esteros',
    category: 'Residencial / Industrial',
    lat: -0.9560,
    lng: -80.6950,
    population: 28000,
    baseVectorRisk: 0.80,
    betweenness: 0.74,
    roleDescription: 'Conecta zona atunera/industrial con Tarqui y Playita Mía.',
  },
  {
    id: 'N10',
    name: 'San Mateo',
    category: 'Periférico / Pesquero',
    lat: -0.9590,
    lng: -80.8090,
    population: 8000,
    baseVectorRisk: 0.55,
    betweenness: 0.18,
    roleDescription: 'Nodo periférico oeste con baja conectividad (fácil de aislar mediante cordón sanitario).',
  },
  {
    id: 'N11',
    name: 'Barbasquillo / Zona Hotelera',
    category: 'Turístico / Residencial',
    lat: -0.9460,
    lng: -80.7560,
    population: 10000,
    baseVectorRisk: 0.20,
    betweenness: 0.42,
    roleDescription: 'Conectado con ULEAM, San Mateo y Mall del Pacífico.',
  },
  {
    id: 'N12',
    name: 'Colegio Manta / Red Escolar Centro',
    category: 'Educación Secundaria',
    lat: -0.9545,
    lng: -80.7190,
    population: 14000,
    baseVectorRisk: 0.50,
    betweenness: 0.67,
    roleDescription: 'Amplificador temprano de contagios domésticos entre Tarqui y Ciudadela Umiña.',
  },
  {
    id: 'N13',
    name: 'Zona Industrial Atunera (Vía Rocafuerte)',
    category: 'Industrial',
    lat: -0.9620,
    lng: -80.6780,
    population: 17000,
    baseVectorRisk: 0.60,
    betweenness: 0.53,
    roleDescription: 'Turnos rotativos que mezclan población de Eloy Alfaro, Los Esteros y Terminal.',
  },
  {
    id: 'N14',
    name: 'Ciudadela Universitaria / Umiña',
    category: 'Residencial',
    lat: -0.9510,
    lng: -80.7380,
    population: 16000,
    baseVectorRisk: 0.30,
    betweenness: 0.79,
    roleDescription: 'Puente directo entre ULEAM, Hospital Rodríguez Zambrano y Centro de Manta.',
  },
  {
    id: 'N15',
    name: 'Puerto Marítimo de Manta',
    category: 'Logístico / Portuario',
    lat: -0.9370,
    lng: -80.7200,
    population: 9000,
    baseVectorRisk: 0.45,
    betweenness: 0.38,
    roleDescription: 'Conectado con Centro de Manta, Mall del Pacífico y corredor logístico.',
  },
  {
    id: 'N16',
    name: 'Urbirríos / Vivienda Popular',
    category: 'Residencial Denso',
    lat: -0.9920,
    lng: -80.6850,
    population: 25000,
    baseVectorRisk: 0.80,
    betweenness: 0.48,
    roleDescription: 'Gran reservorio poblacional conectado por líneas de bus FETUM al Terminal y Tarqui.',
  },
];

/**
 * Urban Mobility & Bus Network Edges (FETUM corridors, commercial flows, university routes).
 */
export const MANTA_EDGES: CityEdge[] = [
  // Corredor Este-Centro
  {
    id: 'E01',
    source: 'N16',
    target: 'N08',
    weight: 0.24,
    routeLabel: 'Línea FETUM Urbirríos ↔ Eloy Alfaro',
  },
  {
    id: 'E02',
    source: 'N08',
    target: 'N01',
    weight: 0.32,
    routeLabel: 'Corredor Masivo Eloy Alfaro ↔ Mercado Tarqui',
  },
  {
    id: 'E03',
    source: 'N01',
    target: 'N07',
    weight: 0.35,
    routeLabel: 'Puente Tarqui ↔ Centro (Av. de la Cultura)',
  },
  {
    id: 'E04',
    source: 'N16',
    target: 'N05',
    weight: 0.20,
    routeLabel: 'Vía Circunvalación Urbirríos ↔ Terminal',
  },

  // Corredor Costero-Industrial
  {
    id: 'E05',
    source: 'N13',
    target: 'N05',
    weight: 0.26,
    routeLabel: 'Corredor Industrial Atunero ↔ Terminal Terrestre',
  },
  {
    id: 'E06',
    source: 'N05',
    target: 'N09',
    weight: 0.28,
    routeLabel: 'Ruta Terminal ↔ Los Esteros',
  },
  {
    id: 'E07',
    source: 'N09',
    target: 'N02',
    weight: 0.29,
    routeLabel: 'Eje Pesquero Los Esteros ↔ Playita Mía',
  },
  {
    id: 'E08',
    source: 'N02',
    target: 'N01',
    weight: 0.34,
    routeLabel: 'Frente Costero Playita Mía ↔ Mercado Tarqui',
  },
  {
    id: 'E09',
    source: 'N13',
    target: 'N09',
    weight: 0.22,
    routeLabel: 'Turnos Atuneros Zona Industrial ↔ Los Esteros',
  },

  // Corredor Universitario-Oeste
  {
    id: 'E10',
    source: 'N07',
    target: 'N14',
    weight: 0.27,
    routeLabel: 'Av. Flavio Reyes / Centro ↔ Umiña',
  },
  {
    id: 'E11',
    source: 'N14',
    target: 'N03',
    weight: 0.33,
    routeLabel: 'Acceso Universitario Umiña ↔ ULEAM',
  },
  {
    id: 'E12',
    source: 'N03',
    target: 'N04',
    weight: 0.21,
    routeLabel: 'Corredor Salud ULEAM ↔ Hospital Rodríguez Zambrano',
  },
  {
    id: 'E13',
    source: 'N03',
    target: 'N11',
    weight: 0.19,
    routeLabel: 'Ruta Oeste ULEAM ↔ Barbasquillo',
  },
  {
    id: 'E14',
    source: 'N11',
    target: 'N10',
    weight: 0.12,
    routeLabel: 'Ruta Costera Spondylus Barbasquillo ↔ San Mateo',
  },

  // Puentes Transversales
  {
    id: 'E15',
    source: 'N08',
    target: 'N03',
    weight: 0.25,
    routeLabel: 'Expreso Estudiantil Eloy Alfaro ↔ ULEAM',
  },
  {
    id: 'E16',
    source: 'N01',
    target: 'N12',
    weight: 0.26,
    routeLabel: 'Conector Escolar Tarqui ↔ Colegio Manta',
  },
  {
    id: 'E17',
    source: 'N12',
    target: 'N14',
    weight: 0.22,
    routeLabel: 'Ruta Escolar Colegio Manta ↔ Umiña',
  },
  {
    id: 'E18',
    source: 'N07',
    target: 'N06',
    weight: 0.28,
    routeLabel: 'Malecón Escénico Centro ↔ Mall del Pacífico',
  },
  {
    id: 'E19',
    source: 'N07',
    target: 'N15',
    weight: 0.18,
    routeLabel: 'Acceso Portuario Centro ↔ Puerto de Manta',
  },
  {
    id: 'E20',
    source: 'N06',
    target: 'N11',
    weight: 0.17,
    routeLabel: 'Corredor Turístico Mall del Pacífico ↔ Barbasquillo',
  },
  {
    id: 'E21',
    source: 'N14',
    target: 'N04',
    weight: 0.20,
    routeLabel: 'Derivación Umiña ↔ Hospital Rodríguez Zambrano',
  },
  {
    id: 'E22',
    source: 'N08',
    target: 'N05',
    weight: 0.23,
    routeLabel: 'Conector Sur Eloy Alfaro ↔ Terminal Terrestre',
  },
];

export const TOTAL_MANTA_POPULATION = MANTA_NODES.reduce((sum, node) => sum + node.population, 0);

export const NODE_MAP: Record<string, CityNode> = Object.fromEntries(
  MANTA_NODES.map((node) => [node.id, node]),
);

export interface NeighborLink {
  neighborId: string;
  edgeId: string;
  weight: number;
  routeLabel: string;
}

export const ADJACENCY_LIST: Record<string, NeighborLink[]> = (() => {
  const adj: Record<string, NeighborLink[]> = {};
  for (const node of MANTA_NODES) {
    adj[node.id] = [];
  }
  for (const edge of MANTA_EDGES) {
    adj[edge.source].push({
      neighborId: edge.target,
      edgeId: edge.id,
      weight: edge.weight,
      routeLabel: edge.routeLabel,
    });
    adj[edge.target].push({
      neighborId: edge.source,
      edgeId: edge.id,
      weight: edge.weight,
      routeLabel: edge.routeLabel,
    });
  }
  return adj;
})();

export const DEFAULT_SIMULATION_PARAMS: SimulationParams = {
  betaHuman: 0.35,
  betaVector: 0.12,
  sigma: 0.33,
  gamma: 0.10,
  hospitalCapacity: 2500,
  vaccineEfficacy: 0.85,
  dailyBudget: 1000,
  vaccineCost: 200,
  vaccineBatchSize: 850,
  fumigationCost: 250,
  cordonCost: 300,
  days: 60,
  seed: 20261030,
  monteCarloRuns: 60,
  patientZeroIds: ['N01'],
  initialInfectedPerNode: 35,
  initialExposedPerNode: 50,
};
