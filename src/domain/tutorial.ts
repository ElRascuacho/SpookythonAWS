import { advanceDay, createGame, RESEARCH_LEVELS, type CureGame, type GameConfig, type ResearchFunding } from "./cureGame";
import { NODE_MAP } from "./mantaGraph";

export const TUTORIAL_STEPS = ["Elige una zona", "Protege habitantes", "Investiga la cura", "Avanza un día"] as const;
export const TUTORIAL_SEEN_KEY = "manta-cero:tutorial:v1";
export type TutorialInteraction = { type: "zone"; nodeId: string } | { type: "protect" } | { type: "fund"; amount: ResearchFunding } | { type: "advance" };

export function interactWithTutorial(state: TutorialState, action: TutorialInteraction): TutorialState {
  if (action.type === "advance") return state.step === 3 ? tutorialReducer(state, { type: "next" }) : state;
  const chosen = tutorialReducer(state, action);
  return chosen === state ? state : tutorialReducer(chosen, { type: "next" });
}

export interface TutorialState {
  step: number;
  game: CureGame;
  nodeId: string | null;
  protection: boolean;
  funding: ResearchFunding;
  error: string;
}

export function createTutorial(config: GameConfig): TutorialState {
  return { step: -1, game: createGame(config), nodeId: null, protection: false, funding: 0, error: "" };
}

export function canContinueTutorial(state: TutorialState): boolean {
  switch (state.step) {
    case -1: return true;
    case 0: return state.nodeId !== null;
    case 1: return state.protection;
    case 2: return state.funding > 0;
    case 3: return state.nodeId !== null && state.protection && state.funding > 0;
    default: return false;
  }
}

type TutorialAction =
  | { type: "next" | "back" | "protect" }
  | { type: "zone"; nodeId: string }
  | { type: "fund"; amount: ResearchFunding };

export function tutorialReducer(state: TutorialState, action: TutorialAction): TutorialState {
  if (action.type === "zone" && state.step === 0 && NODE_MAP[action.nodeId])
    return { ...state, nodeId: action.nodeId };
  if (action.type === "protect" && state.step === 1)
    return { ...state, protection: !state.protection };
  if (action.type === "fund" && state.step === 2 && RESEARCH_LEVELS.includes(action.amount))
    return { ...state, funding: action.amount };
  if (action.type === "back" && state.step > 0 && state.step < 4)
    return { ...state, step: state.step - 1, error: "" };
  if (action.type !== "next" || !canContinueTutorial(state)) return state;
  if (state.step !== 3) return { ...state, step: state.step + 1 };
  try {
    return {
      ...state,
      step: 4,
      game: advanceDay(state.game, [{ nodeId: state.nodeId!, kind: "prevention" }], state.funding),
      error: "",
    };
  } catch (error) {
    return { ...state, error: error instanceof Error ? error.message : "No se pudo simular. Vuelve a intentarlo." };
  }
}
