import {
  fallbackNews,
  type GameNews,
  type NewsSeverity,
  type NewsState,
} from "./newsModel";

const SEVERITIES: NewsSeverity[] = ["calm", "alert", "critical", "victory"];

export async function requestNews(state: NewsState): Promise<GameNews> {
  try {
    const response = await fetch("/api/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!response.ok) throw new Error(String(response.status));
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null)
      throw new Error("Respuesta inválida.");
    const candidate = data as Partial<GameNews>;
    if (
      typeof candidate.headline !== "string" ||
      typeof candidate.body !== "string" ||
      !SEVERITIES.includes(candidate.severity as NewsSeverity)
    )
      throw new Error("Respuesta inválida.");
    return {
      headline: candidate.headline,
      body: candidate.body,
      severity: candidate.severity as NewsSeverity,
      source: "ai",
    };
  } catch {
    return fallbackNews(state);
  }
}
