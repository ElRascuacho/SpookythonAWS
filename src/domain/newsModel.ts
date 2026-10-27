/**
 * Modelo de noticias diarias de Manta Cero.
 *
 * Módulo puro y determinista: sin red, sin DOM, sin `process.env` y sin secretos.
 * Se puede importar desde el cliente sin riesgo de filtrar credenciales.
 */

export type NewsSeverity = "calm" | "alert" | "critical" | "victory";

export interface NewsState {
  day: number;
  totalDays: number;
  status: "playing" | "won" | "lost";
  scenario: "standard" | "surprise" | "escape";
  seed: number;
  dailyBudget: number;
  budgetSpent: number;
  funding: number;
  research: number;
  researchGain: number;
  newCases: number;
  cumulativeInfected: number;
  activeInfections: number;
  infectionsGrowthPct: number;
  hospitalLoadPct: number;
  decisions: { vaccine: number; fumigate: number; cordon: number; isolation?: number; prevention?: number };
  zonesAffected: number;
  zonesTotal: number;
}

export interface GameNews {
  headline: string;
  body: string;
  severity: NewsSeverity;
  source: "ai" | "fallback";
}

export const NEWS_SEVERITIES: readonly NewsSeverity[] = [
  "calm",
  "alert",
  "critical",
  "victory",
];

export const HEADLINE_MAX_CHARS = 90;
export const BODY_MIN_WORDS = 60;
export const BODY_MAX_WORDS = 110;
/** Crecimiento diario (en %) a partir del cual el boletín se considera crítico. */
export const CRITICAL_GROWTH_PCT = 12;

/** Conteo de palabras usado por el contrato del boletín (60–110). */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Formato numérico estable (miles con punto, decimales con coma) sin depender del ICU. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Igual que `formatNumber` pero conservando un decimal (para porcentajes). */
export function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0,0";
  const fixed = Math.abs(value).toFixed(1);
  const [int, frac] = fixed.split(".");
  const sign = value < 0 ? "-" : "";
  return `${sign}${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${frac}`;
}

/** Prioridad: victoria > derrota/colapso/crecimiento alto > contención > alerta. */
export function newsSeverity(state: NewsState): NewsSeverity {
  if (state.status === "won") return "victory";
  if (state.status === "lost") return "critical";
  if (Number(state.hospitalLoadPct) >= 100) return "critical";
  if (Number(state.infectionsGrowthPct) >= CRITICAL_GROWTH_PCT) return "critical";
  if (Number(state.infectionsGrowthPct) <= 0) return "calm";
  return "alert";
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : value;
  });
}

function clampHeadline(text: string, max = HEADLINE_MAX_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const boundary = cut.lastIndexOf(" ");
  const trimmed = boundary > 40 ? cut.slice(0, boundary) : cut;
  return trimmed.replace(/[\s,;:.]+$/, "");
}

/**
 * Garantiza el rango de 60–110 palabras: agrega frases de relleno deterministas
 * y recorta desde el final solo si es imprescindible.
 */
function fitWords(sentences: string[], padding: readonly string[]): string {
  const out = sentences.filter(Boolean);
  let words = countWords(out.join(" "));
  for (const sentence of padding) {
    if (words >= BODY_MIN_WORDS) break;
    out.push(sentence);
    words += countWords(sentence);
  }
  while (words > BODY_MAX_WORDS && out.length > 3) {
    words -= countWords(out.pop() ?? "");
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

const HEADLINES: Record<NewsSeverity, readonly string[]> = {
  victory: [
    "Manta Cero, día {day}: brote contenido con {cum} contagios acumulados",
    "COE Manta, día {day}: contención confirmada y {active} casos activos",
    "Parte oficial, día {day}: Manta Cero cierra el brote con {active} casos activos",
  ],
  calm: [
    "Manta Cero, día {day}: {new} casos nuevos y variación de {g}%",
    "COE Manta, día {day}: incidencia en descenso con {new} contagios nuevos",
    "Boletín de Manta, día {day}: {new} casos nuevos y {h}% de carga hospitalaria",
  ],
  alert: [
    "Manta Cero, día {day}: {new} casos nuevos y {h}% de ocupación hospitalaria",
    "COE Manta, día {day}: vigilancia activa por {new} contagios nuevos",
    "Boletín cantonal, día {day}: {new} casos nuevos y {active} casos activos",
  ],
  critical: [
    "Manta Cero, día {day}: alerta crítica con {h}% de carga hospitalaria",
    "COE Manta, día {day}: {new} casos nuevos y presión hospitalaria alta",
    "Alerta roja, día {day}: {h}% de ocupación en el Rodríguez Zambrano",
  ],
};

const OPENERS = [
  "Boletín del COE cantonal de Manta, día {day} de {total}: {new} casos nuevos y {cum} contagios acumulados en el cantón.",
  "Parte operativo de la Operación Manta Cero, jornada {day} de {total}: se notifican {new} casos nuevos y la serie acumulada llega a {cum} personas.",
  "Informe diario del comité epidemiológico de Manta, día {day} de {total}: {new} notificaciones nuevas y {cum} contagios acumulados desde el inicio del brote.",
  "Reporte oficial de Manta Cero, día {day} de {total}: {new} casos nuevos detectados y {cum} acumulados en el cantón.",
  "Boletín operativo del Municipio de Manta, día {day} de {total}: {new} casos nuevos y {cum} contagios confirmados en la ciudad.",
] as const;

const HOSPITAL = [
  "El Hospital Rodríguez Zambrano opera al {h}% de su capacidad y quedan {active} casos activos en vigilancia.",
  "La carga sobre el Hospital Rodríguez Zambrano se sitúa en {h}% y el seguimiento activo cubre {active} pacientes.",
  "La ocupación hospitalaria reportada es de {h}% y permanecen {active} casos activos bajo control domiciliario.",
] as const;

const DECISIONS = [
  "Decisiones del día: {v} brigadas de vacunación, {f} de fumigación, {c} de cordón, {i} de aislamiento y {p} de prevención, con {spent} dólares ejecutados.",
  "El plan desplegó {v} brigadas de vacunación, {f} de fumigación, {c} de cordón, {i} de aislamiento y {p} de prevención, con un gasto de {spent} dólares.",
  "Se asignaron {v} brigadas de vacunación, {f} de fumigación, {c} de cordón, {i} de aislamiento y {p} de prevención, con {spent} dólares ejecutados.",
] as const;

const TRENDS = [
  "La variación de contagios fue de {g}%; la investigación avanza {rg} puntos por día y acumula {r}%.",
  "Frente a la jornada anterior la variación es de {g}%, el laboratorio suma {rg} puntos diarios y llega a {r}% de avance.",
  "El crecimiento diario se ubica en {g}%, con {spent} dólares ejecutados y {fund} destinados al laboratorio.",
] as const;

const CLOSINGS: Record<NewsSeverity, readonly string[]> = {
  calm: [
    "Se recomienda mantener el cerco en {zones} de {zt} zonas y sostener la cobertura de vacunación en los barrios con menor alcance.",
    "El comité pide continuar la vigilancia en {zones} de {zt} zonas y no relajar el lavado de manos ni el control de criaderos.",
  ],
  alert: [
    "Se recomienda reforzar la fumigación intramuros en {zones} de {zt} zonas afectadas y vigilar los mercados y el puerto pesquero.",
    "El comité sugiere priorizar cercos en {zones} de {zt} zonas y mantener la búsqueda activa de casos febriles en barrios periféricos.",
  ],
  critical: [
    "El comité solicita a la ciudadanía extremar la bioseguridad y al MSP priorizar insumos para las {zones} zonas más comprometidas de {zt}.",
    "Se pide a la red de salud redistribuir camas y sostener el triaje en las {zones} de {zt} zonas con mayor transmisión comunitaria.",
  ],
  victory: [
    "La tendencia permite declarar contención en {zones} de {zt} zonas, con vigilancia sostenida durante los próximos catorce días.",
    "El comité declara contención operativa en {zones} de {zt} zonas y mantiene el monitoreo de casos importados por vía portuaria.",
  ],
};

const PADDING = [
  "El COE cantonal mantiene activo el monitoreo en los cantones vecinos de Manabí.",
  "La red de atención primaria sostiene la búsqueda activa de casos en los sectores periféricos.",
  "Se recuerda que los datos son preliminares y se consolidan cada veinticuatro horas.",
  "La coordinación con el MSP y el COE Nacional se mantiene para el abastecimiento de insumos.",
] as const;

/**
 * Boletín determinista en español (Ecuador), tono de parte operativo.
 * Varía por día, semilla, escenario y estado; siempre cita cifras reales del estado.
 */
export function fallbackNews(state: NewsState): GameNews {
  const severity = newsSeverity(state);
  const values: Record<string, string> = {
    day: formatNumber(state.day),
    total: formatNumber(state.totalDays),
    new: formatNumber(state.newCases),
    cum: formatNumber(state.cumulativeInfected),
    active: formatNumber(state.activeInfections),
    h: formatDecimal(state.hospitalLoadPct),
    g: formatDecimal(state.infectionsGrowthPct),
    v: formatNumber(state.decisions?.vaccine ?? 0),
    f: formatNumber(state.decisions?.fumigate ?? 0),
    c: formatNumber(state.decisions?.cordon ?? 0),
    i: formatNumber(state.decisions?.isolation ?? 0),
    p: formatNumber(state.decisions?.prevention ?? 0),
    d: formatNumber(state.dailyBudget),
    spent: formatNumber(state.budgetSpent),
    fund: formatNumber(state.funding),
    r: formatNumber(state.research),
    rg: formatNumber(state.researchGain),
    zones: formatNumber(state.zonesAffected),
    zt: formatNumber(state.zonesTotal),
  };

  const key = `${state.day}|${state.seed}|${state.scenario}|${state.status}`;
  let cursor = 0;
  const choose = (pool: readonly string[]) => {
    const index = (stableHash(key) + cursor * 7) % pool.length;
    cursor += 1;
    return pool[index]!;
  };

  const headline = clampHeadline(fill(choose(HEADLINES[severity]), values));

  const sentences = [
    fill(choose(OPENERS), values),
    fill(choose(HOSPITAL), values),
    fill(choose(DECISIONS), values),
    fill(choose(TRENDS), values),
    fill(choose(CLOSINGS[severity]), values),
  ];
  const body = fitWords(
    sentences,
    PADDING.map((template) => fill(template, values)),
  );

  return { headline, body, severity, source: "fallback" };
}

/** Contexto territorial y reglas editoriales del Municipio de Manta. */
export const NEWS_SYSTEM_PROMPT = [
  "Eres el/la editor(a) de comunicaciones de emergencia del Municipio de Manta, en la provincia de Manabí, Ecuador.",
  "Redactas el boletín epidemiológico diario de la Operación Manta Cero.",
  "Tono: parte operativo, preciso, sobrio, sin sensacionalismo, sin especulación política y sin atribuir culpas.",
  "Escribe siempre en español de Ecuador, en texto plano (sin markdown, sin viñetas, sin emojis).",
  "Contexto territorial obligatorio: Manta es una economía dolarizada (USD), sede del segundo puerto atunero del Ecuador, en recuperación desde el terremoto de 2016; las lluvias de El Niño y el vector del dengue condicionan el riesgo; la respuesta se coordina con el MSP y el COE Nacional; el Hospital Rodríguez Zambrano es la referencia de capacidad; la ULEAM apoya con vigilancia y personal; las remesas y el turismo sostienen la economía local y son vulnerables a una crisis sanitaria.",
  "Reglas de contenido: usa únicamente las cifras entregadas en el JSON del usuario, sin inventar números ni fechas; menciona las decisiones del día (vacunación, fumigación, cercos, aislamiento y prevención), el financiamiento y las tendencias (casos nuevos, crecimiento, carga hospitalaria, investigación).",
  "No escribas cifras numéricas en el titular ni en el cuerpo: describe las tendencias de forma cualitativa (aumento, descenso, presión hospitalaria, avance científico) y las decisiones del día. Las cifras exactas las publica el tablero oficial por separado.",
  "Responde SOLO con un objeto JSON válido, sin texto adicional, con esta forma exacta:",
  '{"headline": string (máximo 90 caracteres), "body": string (entre 60 y 110 palabras), "severity": "calm" | "alert" | "critical" | "victory"}',
  'Criterio de severity: "victory" si el brote está contenido, "critical" si hay colapso hospitalario o crecimiento acelerado, "calm" si el crecimiento es cero o negativo, "alert" en el resto de los casos.',
].join(" ");

/** Prompt listo para el proveedor de IA: sistema editorial + estado compacto. */
export function buildNewsPrompt(state: NewsState): { system: string; user: string } {
  return { system: NEWS_SYSTEM_PROMPT, user: JSON.stringify(state) };
}
