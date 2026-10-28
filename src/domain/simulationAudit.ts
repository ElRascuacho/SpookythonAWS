import { computePercentile } from "./monteCarlo";
import type { SimulationSample } from "./multiSimulation";
import type { PolicyPair } from "./policyEvaluation";

export interface Distribution {
  min: number;
  max: number;
  median: number;
  p10: number;
  p90: number;
  mean: number;
}

export interface DailyBand {
  day: number;
  mean: number;
  p10: number;
  p90: number;
}

export function distribution(values: number[]): Distribution {
  if (!values.length) throw new Error("No hay valores para resumir.");
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: computePercentile(sorted, 50),
    p10: computePercentile(sorted, 10),
    p90: computePercentile(sorted, 90),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

export function dailyCumulativeBand(series: number[][]): DailyBand[] {
  if (!series.length) return [];
  const days = Math.min(...series.map((row) => row.length));
  if (!Number.isFinite(days) || days <= 0) return [];
  return Array.from({ length: days }, (_, day) => {
    const stats = distribution(series.map((row) => row[day]));
    return { day, mean: stats.mean, p10: stats.p10, p90: stats.p90 };
  });
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: (string | number)[][]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function samplesToCsv(
  meta: { plan: string; difficulty: string; seed: number },
  samples: SimulationSample[],
): string {
  const header = ["plan", "dificultad", "semilla", "indice", "contagios", "pico", "dia_pico", "gasto", "vacunas", "dias_colapso_hospital"];
  const rows = [...samples]
    .sort((a, b) => a.index - b.index)
    .map((sample) => [meta.plan, meta.difficulty, meta.seed, sample.index, sample.infected, sample.peak, sample.peakDay, sample.spent, sample.vaccines, sample.hospitalCollapseDays]);
  return csv([header, ...rows]);
}

export function pairsToCsv(
  meta: { plan: string; difficulty: string; seed: number; policyVersion: number; registryVersion: string },
  pairs: PolicyPair[],
): string {
  const header = ["plan", "dificultad", "semilla", "politica", "registro", "indice", "contagios_politica", "contagios_sgc", "diferencia_sgc_menos_politica", "pico_politica", "dia_pico_politica", "gasto_politica", "vacunas_politica", "dias_colapso_politica", "pico_sgc", "dia_pico_sgc", "gasto_sgc", "vacunas_sgc", "dias_colapso_sgc"];
  const rows = [...pairs]
    .sort((a, b) => a.index - b.index)
    .map((pair) => [meta.plan, meta.difficulty, meta.seed, meta.policyVersion, meta.registryVersion, pair.index, pair.candidate.infected, pair.sgc.infected, pair.sgc.infected - pair.candidate.infected, pair.candidate.peak, pair.candidate.peakDay, pair.candidate.spent, pair.candidate.vaccines, pair.candidate.hospitalCollapseDays, pair.sgc.peak, pair.sgc.peakDay, pair.sgc.spent, pair.sgc.vaccines, pair.sgc.hospitalCollapseDays]);
  return csv([header, ...rows]);
}
