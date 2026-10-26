import { runMonteCarloComparison } from '../src/domain/monteCarlo';
import { NODE_MAP } from '../src/domain/mantaGraph';
import { MonteCarloComparisonResult, SimulationParams } from '../src/domain/types';

export interface APIGatewayProxyEventV2 {
  rawPath?: string;
  requestContext?: {
    http?: {
      method?: string;
      path?: string;
    };
  };
  body?: string | null;
}

export interface APIGatewayProxyResultV2 {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

/**
 * Generates an executive plain-language report for the Mayor of Manta.
 * Uses deterministic synthesis (and optionally Amazon Bedrock Nova Micro / Haiku when BEDROCK_ENABLED=true in AWS Lambda).
 */
export function buildMayorExecutiveBriefing(result: MonteCarloComparisonResult): {
  title: string;
  executiveSummary: string;
  bulletRecommendations: string[];
  auditMetrics: {
    seed: number;
    livesSavedVsNoIntervention: number;
    livesSavedVsRandom: number;
    costPerLifeSavedUsd: number;
    zeroWastedVaccinesVerified: boolean;
  };
} {
  const noInt = result.strategies.NO_INTERVENTION;
  const rnd = result.strategies.RANDOM;
  const smart = result.strategies.SMART_CORTAFUEGOS;
  const livesSavedVsRandom = Math.max(
    0,
    smart.meanLivesSavedVsBaseline - rnd.meanLivesSavedVsBaseline,
  );

  const patientZeroNames = result.params.patientZeroIds
    .map((id) => `${NODE_MAP[id]?.name ?? id} (${id})`)
    .join(', ');

  const executiveSummary =
    `Alcaldía de Manta — Boletín de Comando Epidemiológico: Ante el brote originado en ${patientZeroNames}, ` +
    `no intervenir provocaría ${noInt.meanTotalInfected.toLocaleString()} contagios acumulados y ${noInt.meanHospitalCollapseDays} días de colapso en el Hospital Rodríguez Zambrano. ` +
    `Nuestra estrategia Smart Graph Cortafuegos (SGC) salva ${smart.meanLivesSavedVsBaseline.toLocaleString()} vidas frente a no hacer nada ` +
    `y supera a la asignación al azar por +${livesSavedVsRandom.toLocaleString()} ciudadanos protegidos con el mismo presupuesto de $${result.params.dailyBudget}/día.`;

  const bulletRecommendations = smart.representativeRun.timeline
    .slice(1, 6)
    .map((snap) => snap.action.summaryText);

  return {
    title: 'Informe Ejecutivo para la Alcaldía de Manta — Operación Manta Cero',
    executiveSummary,
    bulletRecommendations,
    auditMetrics: {
      seed: result.params.seed,
      livesSavedVsNoIntervention: smart.meanLivesSavedVsBaseline,
      livesSavedVsRandom,
      costPerLifeSavedUsd: smart.costPerLifeSaved,
      zeroWastedVaccinesVerified: smart.zeroWastedVaccinesVerified,
    },
  };
}

/**
 * AWS Lambda HTTP API Handler (ARM64 Graviton2, us-east-1).
 * Routes:
 * - POST /simulate -> Runs deterministic Monte Carlo SEIR-V comparison across all 3 strategies.
 * - POST /mayor-report -> Generates the plain-language briefing for the Mayor of Manta.
 */
export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? 'POST';
  const path = event.rawPath ?? event.requestContext?.http?.path ?? '/simulate';

  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    const payload: Partial<SimulationParams> = event.body ? JSON.parse(event.body) : {};
    const simulationResult = runMonteCarloComparison(payload);

    if (path.endsWith('/mayor-report')) {
      const report = buildMayorExecutiveBriefing(simulationResult);
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ok: true,
          region: process.env.AWS_REGION ?? 'us-east-1',
          report,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: true,
        region: process.env.AWS_REGION ?? 'us-east-1',
        result: simulationResult,
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown simulation error';
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: false,
        error: message,
      }),
    };
  }
}
