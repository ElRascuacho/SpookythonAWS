import { describe, expect, test } from "bun:test";
import { advanceDay, createGame, getPlanCost, type GameConfig } from "../cureGame";
import { canContinueTutorial, createTutorial, tutorialReducer } from "../tutorial";

const config: GameConfig = { seed: 20261030, scenario: "standard", patientZeroId: "N01", dailyBudget: 7500 };

describe("Interactive tutorial", () => {
  test("requires each practical choice, allows undo and rejects out-of-step actions", () => {
    let state = tutorialReducer(createTutorial(config), { type: "next" });
    expect(state.step).toBe(0);
    expect(canContinueTutorial(state)).toBe(false);
    expect(tutorialReducer(state, { type: "next" })).toBe(state);
    expect(tutorialReducer(state, { type: "protect" })).toBe(state);
    expect(tutorialReducer(state, { type: "zone", nodeId: "invalid" })).toBe(state);
    state = tutorialReducer(state, { type: "zone", nodeId: "N01" });
    state = tutorialReducer(state, { type: "next" });
    expect(canContinueTutorial(state)).toBe(false);
    state = tutorialReducer(state, { type: "protect" });
    expect(canContinueTutorial(state)).toBe(true);
    state = tutorialReducer(state, { type: "protect" });
    expect(canContinueTutorial(state)).toBe(false);
    state = tutorialReducer(state, { type: "protect" });
    state = tutorialReducer(state, { type: "next" });
    expect(state.step).toBe(2);
    expect(canContinueTutorial(state)).toBe(false);
    state = tutorialReducer(state, { type: "fund", amount: 1200 });
    state = tutorialReducer(state, { type: "back" });
    expect(state.step).toBe(1);
    expect(state.protection).toBe(true);
    expect(state.funding).toBe(1200);
  });

  test("uses the real engine once, conserves budget, leaves the existing game untouched and restarts fresh", () => {
    const existing = advanceDay(createGame(config), [{ nodeId: "N03", kind: "vaccine" }], 1200);
    const before = JSON.stringify(existing);
    for (const amount of [1200, 2200] as const) {
      let state = createTutorial(existing.config);
      state = tutorialReducer(state, { type: "next" });
      state = tutorialReducer(state, { type: "zone", nodeId: "N01" });
      state = tutorialReducer(state, { type: "next" });
      state = tutorialReducer(state, { type: "protect" });
      state = tutorialReducer(state, { type: "next" });
      state = tutorialReducer(state, { type: "fund", amount });
      state = tutorialReducer(state, { type: "next" });
      const initial = state.game;
      state = tutorialReducer(state, { type: "next" });
      expect(state.step).toBe(4);
      expect(state.game.day).toBe(1);
      expect(initial.day).toBe(0);
      expect(state.game.research).toBe(amount === 1200 ? 3 : 5);
      expect(state.game.actions[1].preventionNodes).toEqual(["N01"]);
      expect(state.game.actions[1].budgetSpent).toBe(getPlanCost([{ nodeId: "N01", kind: "prevention" }], amount));
      expect(state.game.actions[1].budgetSpent).toBeLessThanOrEqual(config.dailyBudget);
      expect(tutorialReducer(state, { type: "next" })).toBe(state);
      expect(tutorialReducer(state, { type: "back" })).toBe(state);
      expect(JSON.stringify(existing)).toBe(before);
      expect(createTutorial(config).step).toBe(-1);
    }
  });

  test("preserves the practice and surfaces simulation errors instead of discarding it", () => {
    const state = { ...createTutorial(config), step: 3, nodeId: "N01", protection: true, funding: 1200 as const };
    state.game = { ...state.game, status: "lost" };
    const failed = tutorialReducer(state, { type: "next" });
    expect(failed.step).toBe(3);
    expect(failed.game).toBe(state.game);
    expect(failed.error).toBe("La partida ya terminó.");
  });
});
