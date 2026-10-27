import { runMonteCarloComparison } from "../src/domain/monteCarlo";
import { NODE_MAP } from "../src/domain/mantaGraph";
import {
  MonteCarloComparisonResult,
  SimulationParams,
} from "../src/domain/types";
import { PartialSimulationParamsSchema } from "../src/domain/schemas/simulationParams.schema";
import { authorize } from "./auth";
import { NEWS_ROUTE, handleNewsRoute } from "./news";

export interface APIGatewayProxyEventV2 {
  rawPath?: string;
  headers?: Record<string, string | undefined>;
  cookies?: string[];
  isBase64Encoded?: boolean;
  requestContext?: {
    http?: {
      method?: string;
      path?: string;
      sourceIp?: string;
    };
  };
  body?: string | null;
}

export interface APIGatewayProxyResultV2 {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  cookies?: string[];
}

const RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

/**
 * Generates an executive plain-language report for the Mayor of Manta.
 * Uses deterministic synthesis (and optionally Amazon Bedrock Nova Micro / Haiku when BEDROCK_ENABLED=true in AWS Lambda).
 */
export function buildMayorExecutiveBriefing(
  result: MonteCarloComparisonResult,
): {
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
    .join(", ");

  const executiveSummary =
    `Alcaldía de Manta — Boletín de Comando Epidemiológico: Ante el brote originado en ${patientZeroNames}, ` +
    `no intervenir provocaría ${noInt.meanTotalInfected.toLocaleString()} contagios acumulados y ${noInt.meanHospitalCollapseDays} días de colapso en el Hospital Rodríguez Zambrano. ` +
    `Nuestra estrategia Smart Graph Cortafuegos (SGC) salva ${smart.meanLivesSavedVsBaseline.toLocaleString()} vidas frente a no hacer nada ` +
    `y supera a la asignación al azar por +${livesSavedVsRandom.toLocaleString()} ciudadanos protegidos con el mismo presupuesto de $${result.params.dailyBudget}/día.`;

  const bulletRecommendations = smart.representativeRun.timeline
    .slice(1, 6)
    .map((snap) => snap.action.summaryText);

  return {
    title: "Informe Ejecutivo para la Alcaldía de Manta — Operación Manta Cero",
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
 * - POST /api/news -> Generates the daily bulletin with OpenAI (fallback deterministic).
 * - POST /simulate -> Runs deterministic Monte Carlo SEIR-V comparison across all 3 strategies.
 * - POST /mayor-report -> Generates the plain-language briefing for the Mayor of Manta.
 */
export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext?.http?.method ?? "POST";
  const rawPath = event.rawPath ?? event.requestContext?.http?.path ?? "/simulate";
  const path = rawPath.replace(/^\/prod(?=\/|$)/, "") || "/";

  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(event.headers ?? {}))
      if (value) headers.set(key, value);
    if (event.cookies) headers.set("cookie", event.cookies.join("; "));
    const body = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "");
    if (Buffer.byteLength(body) > 65_536)
      return {
        statusCode: 413,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Solicitud demasiado grande." }),
      };
    const request = new Request(`https://api.internal${path}`, {
      method,
      headers,
      body: ["GET", "HEAD"].includes(method) ? undefined : body,
    });
    const clientIp = event.requestContext?.http?.sourceIp ?? "unknown";
    const auth = await authorize(request, clientIp);
    if (auth) {
      const cookie = auth.headers.get("set-cookie");
      auth.headers.delete("set-cookie");
      return {
        statusCode: auth.status,
        headers: Object.fromEntries(auth.headers.entries()),
        body: await auth.text(),
        ...(cookie ? { cookies: [cookie] } : {}),
      };
    }
    // Se resuelve antes del enrutado de simulación: comparte contrato con el dev server.
    if (path === NEWS_ROUTE) {
      const newsResponse = await handleNewsRoute(request, clientIp);
      return {
        statusCode: newsResponse.status,
        headers: Object.fromEntries(newsResponse.headers.entries()),
        body: await newsResponse.text(),
      };
    }
    if (!["/simulate", "/mayor-report"].includes(path))
      return {
        statusCode: 404,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "Ruta no encontrada." }),
      };
    if (method !== "POST")
      return {
        statusCode: 405,
        headers: { ...RESPONSE_HEADERS, Allow: "POST" },
        body: JSON.stringify({ error: "Método no permitido." }),
      };
    const rawPayload = body ? JSON.parse(body) : {};
    const payload = PartialSimulationParamsSchema.parse(rawPayload);
    const simulationResult = runMonteCarloComparison(payload);

    if (path.endsWith("/mayor-report")) {
      const report = buildMayorExecutiveBriefing(simulationResult);
      return {
        statusCode: 200,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({
          ok: true,
          region: process.env.AWS_REGION ?? "us-east-1",
          report,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        ok: true,
        region: process.env.AWS_REGION ?? "us-east-1",
        result: simulationResult,
      }),
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown simulation error";
    return {
      statusCode: 400,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({
        ok: false,
        error: message,
      }),
    };
  }
}
