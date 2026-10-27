import {
  BODY_MAX_WORDS,
  BODY_MIN_WORDS,
  HEADLINE_MAX_CHARS,
  NEWS_SEVERITIES,
  buildNewsPrompt,
  countWords,
  fallbackNews,
  type GameNews,
  type NewsSeverity,
  type NewsState,
} from "../src/domain/newsModel";
import { json } from "./auth";

/** Ruta HTTP del boletín diario (solo POST). */
export const NEWS_ROUTE = "/api/news";
/** Tope de cuerpo JSON para /api/news (bytes). */
export const NEWS_BODY_LIMIT = 8_192;
/** Solicitudes por IP dentro de la ventana. */
export const NEWS_RATE_LIMIT = 20;
export const NEWS_RATE_WINDOW_MS = 60_000;
/** Tiempo máximo de espera del proveedor de IA. */
export const NEWS_TIMEOUT_MS = 8_000;
/** Entradas máximas del caché en memoria (solo respuestas válidas de la IA). */
export const NEWS_CACHE_LIMIT = 150;

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

type Environment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

// shortcut: caché y rate limit por proceso; compartir en Redis/WAF antes de escalar a varias instancias.
const newsCache = new Map<string, GameNews>();
const rateLimitHits = new Map<string, { count: number; until: number }>();

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Hash corto del estado normalizado; ignora el orden de las claves. */
export function newsCacheKey(state: NewsState): string {
  return stableHash(
    JSON.stringify([
      state.day,
      state.totalDays,
      state.status,
      state.scenario,
      state.seed,
      state.dailyBudget,
      state.budgetSpent,
      state.funding,
      state.research,
      state.researchGain,
      state.newCases,
      state.cumulativeInfected,
      state.activeInfections,
      state.infectionsGrowthPct,
      state.hospitalLoadPct,
      state.decisions.vaccine,
      state.decisions.fumigate,
      state.decisions.cordon,
      state.zonesAffected,
      state.zonesTotal,
    ]),
  );
}

/** Limpia el caché en memoria (usado por pruebas y por reinicios de partida). */
export function clearNewsCache(): void {
  newsCache.clear();
}

/** Limpia el limitador de tasa en memoria (usado por pruebas). */
export function clearNewsRateLimit(): void {
  rateLimitHits.clear();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Valida y normaliza el estado recibido por HTTP; null si no cumple el contrato. */
export function readNewsState(value: unknown): NewsState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const decisions = record.decisions;
  if (!decisions || typeof decisions !== "object" || Array.isArray(decisions))
    return null;
  const orders = decisions as Record<string, unknown>;
  const numbers = [
    "day",
    "totalDays",
    "seed",
    "dailyBudget",
    "budgetSpent",
    "funding",
    "research",
    "researchGain",
    "newCases",
    "cumulativeInfected",
    "activeInfections",
    "infectionsGrowthPct",
    "hospitalLoadPct",
    "zonesAffected",
    "zonesTotal",
  ] as const;
  for (const key of numbers) if (!isFiniteNumber(record[key])) return null;
  for (const key of ["vaccine", "fumigate", "cordon"] as const)
    if (!isFiniteNumber(orders[key])) return null;
  if (!["playing", "won", "lost"].includes(record.status as string)) return null;
  if (!["standard", "surprise", "escape"].includes(record.scenario as string))
    return null;
  return {
    day: record.day as number,
    totalDays: record.totalDays as number,
    status: record.status as NewsState["status"],
    scenario: record.scenario as NewsState["scenario"],
    seed: record.seed as number,
    dailyBudget: record.dailyBudget as number,
    budgetSpent: record.budgetSpent as number,
    funding: record.funding as number,
    research: record.research as number,
    researchGain: record.researchGain as number,
    newCases: record.newCases as number,
    cumulativeInfected: record.cumulativeInfected as number,
    activeInfections: record.activeInfections as number,
    infectionsGrowthPct: record.infectionsGrowthPct as number,
    hospitalLoadPct: record.hospitalLoadPct as number,
    decisions: {
      vaccine: orders.vaccine as number,
      fumigate: orders.fumigate as number,
      cordon: orders.cordon as number,
    },
    zonesAffected: record.zonesAffected as number,
    zonesTotal: record.zonesTotal as number,
  };
}

/** Valida la salida del modelo: tipos, severidad, longitudes y ausencia de markdown. */
export function readModelNews(content: unknown): GameNews | null {
  if (typeof content !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const headline =
    typeof record.headline === "string"
      ? record.headline.replace(/\s+/g, " ").trim()
      : "";
  const body =
    typeof record.body === "string"
      ? record.body.replace(/\s+/g, " ").trim()
      : "";
  const severity = record.severity;
  if (!headline || headline.length > HEADLINE_MAX_CHARS) return null;
  const words = countWords(body);
  if (words < BODY_MIN_WORDS || words > BODY_MAX_WORDS) return null;
  if (typeof severity !== "string") return null;
  if (!NEWS_SEVERITIES.includes(severity as NewsSeverity)) return null;
  if (/[*_#`]|<\/?[a-z]/i.test(headline + body)) return null;
  return { headline, body, severity: severity as NewsSeverity, source: "ai" };
}

function readCacheEntry(key: string): GameNews | null {
  const cached = newsCache.get(key);
  if (!cached) return null;
  // Refresca el orden de inserción para comportarse como LRU.
  newsCache.delete(key);
  newsCache.set(key, cached);
  return { ...cached };
}

function writeCacheEntry(key: string, news: GameNews): void {
  if (newsCache.size >= NEWS_CACHE_LIMIT) {
    const oldest = newsCache.keys().next();
    if (!oldest.done) newsCache.delete(oldest.value);
  }
  newsCache.set(key, { ...news });
}

/**
 * Toma un cupo del limitador por IP. `ok: false` indica 429 con `Retry-After`.
 */
export function takeNewsRateLimit(
  clientIp: string,
  now = Date.now(),
): { ok: boolean; retryAfter: number } {
  for (const [ip, record] of rateLimitHits)
    if (record.until <= now) rateLimitHits.delete(ip);
  const record = rateLimitHits.get(clientIp) ?? {
    count: 0,
    until: now + NEWS_RATE_WINDOW_MS,
  };
  if (
    record.count >= NEWS_RATE_LIMIT ||
    (!rateLimitHits.has(clientIp) && rateLimitHits.size >= 10_000)
  ) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((record.until - now) / 1_000)),
    };
  }
  record.count += 1;
  rateLimitHits.set(clientIp, record);
  return { ok: true, retryAfter: 0 };
}

/**
 * Genera el boletín diario con OpenAI. Nunca lanza: ante cualquier fallo,
 * respuesta inválida o falta de credenciales devuelve el boletín determinista.
 * La clave vive solo en el servidor y jamás se incluye en logs o respuestas.
 */
export async function generateNews(
  state: NewsState,
  env: Environment = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<GameNews> {
  try {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) return fallbackNews(state);

    const key = newsCacheKey(state);
    const cached = readCacheEntry(key);
    if (cached) return cached;

    const { system, user } = buildNewsPrompt(state);
    const baseUrl = (env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    const model = env.OPENAI_NEWS_MODEL?.trim() || DEFAULT_MODEL;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS);
    let content: unknown;
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.6,
          max_tokens: 320,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) return fallbackNews(state);
      const payload: unknown = await response.json();
      const choices = (payload as { choices?: unknown })?.choices;
      const message = Array.isArray(choices)
        ? (choices[0] as { message?: { content?: unknown } } | undefined)?.message
        : undefined;
      content = message?.content;
    } finally {
      clearTimeout(timer);
    }

    const news = readModelNews(content);
    if (!news) return fallbackNews(state);
    writeCacheEntry(key, news);
    return news;
  } catch {
    // Nunca se propaga el error del proveedor (podría contener datos sensibles).
    return fallbackNews(state);
  }
}

/**
 * Maneja POST /api/news: valida método, tasa, tamaño y estado, y responde el boletín.
 * Debe invocarse únicamente después de `authorize()`.
 */
export async function handleNewsRoute(
  request: Request,
  clientIp: string,
  env: Environment = process.env,
  now = Date.now(),
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  if (request.method !== "POST")
    return json(405, { error: "Método no permitido." }, { Allow: "POST" });

  const quota = takeNewsRateLimit(clientIp, now);
  if (!quota.ok)
    return json(
      429,
      { error: "Demasiadas solicitudes de boletín. Espera un momento." },
      { "Retry-After": String(quota.retryAfter) },
    );

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > NEWS_BODY_LIMIT)
    return json(413, { error: "Solicitud demasiado grande." });

  let payload: unknown;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return json(400, { error: "Solicitud inválida." });
  }

  const state = readNewsState(payload);
  if (!state) return json(400, { error: "Estado de partida inválido." });

  const news = await generateNews(state, env, fetchImpl);
  return json(200, news);
}
