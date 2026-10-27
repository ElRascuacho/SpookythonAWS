import type { DailyCitySnapshot } from "./types";

export const CHAPTERS = [
  {
    title: "La última guardia",
    location: "Hospital Rodríguez Zambrano",
    nodeId: "N04",
    days: 6,
    objective: "Al día 6, mantén el hospital operativo, con hasta 100 infecciosos en su zona y 15% de investigación.",
    briefing: "El hospital recibe los primeros casos. Protege sus accesos y financia el análisis del patógeno. Si la red hospitalaria se satura, perdemos la operación.",
    victory: "El hospital sigue operativo. Las muestras ya están en camino al puerto.",
  },
  {
    title: "Puerto cerrado",
    location: "Puerto Marítimo de Manta",
    nodeId: "N15",
    days: 8,
    objective: "Al día 8, reúne 1.800 inmunes en el puerto sin superar 500 infecciosos allí.",
    briefing: "El brote llegó al puerto. Protege a su población con vacunación y contención. R incluye vacunados y recuperados: no se simula una evacuación.",
    victory: "La población protegida permite sostener la operación portuaria. El laboratorio puede continuar.",
  },
  {
    title: "Antes del amanecer",
    location: "Mercado Central de Tarqui",
    nodeId: "N01",
    days: 20,
    objective: "Completa la cura en 20 días antes de que el brote alcance al 35% de Manta.",
    briefing: "Esta es la última oportunidad. El laboratorio necesita financiación prioritaria y la ciudad necesita tus brigadas. No alcanza con investigar: debes contener el brote.",
    victory: "Cura validada. Las tres operaciones han terminado: Manta tiene una nueva oportunidad.",
  },
] as const;

export type CampaignChapter = 0 | 1 | 2;

export function campaignStatus(
  chapter: CampaignChapter,
  day: number,
  snapshot: DailyCitySnapshot,
  research: number,
): "playing" | "won" | "lost" {
  if (chapter === 0 && snapshot.hospitalCollapsed) return "lost";
  if (chapter === 1 && snapshot.nodes.N15.I > 500) return "lost";
  if (chapter === 2 && research >= 100) return "won";
  if (day < CHAPTERS[chapter].days) return "playing";
  if (chapter === 0) return research >= 15 && snapshot.nodes.N04.I <= 100 ? "won" : "lost";
  if (chapter === 1) return snapshot.nodes.N15.R >= 1800 ? "won" : "lost";
  return "lost";
}

export function campaignReadout(chapter: CampaignChapter, snapshot: DailyCitySnapshot, research: number) {
  if (chapter === 0) return `Hospital ${snapshot.hospitalCollapsed ? "saturado" : "operativo"} · zona ${snapshot.nodes.N04.I}/100 infecciosos · investigación ${research}/15%`;
  if (chapter === 1) return `Puerto: ${snapshot.nodes.N15.R.toLocaleString("es-EC")}/1.800 inmunes · ${snapshot.nodes.N15.I}/500 infecciosos`;
  return `Cura ${research}/100%`;
}
