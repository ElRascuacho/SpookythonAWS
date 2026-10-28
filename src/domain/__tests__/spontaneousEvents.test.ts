import { describe, expect, test } from "bun:test";
import { advanceDay, createGame } from "../cureGame";
import { createLabEvent } from "../spontaneousEvents";
import { NODE_MAP } from "../mantaGraph";
import type { GameConfig, Order } from "../cureGame";

const config: GameConfig = { seed: 20261030, scenario: "standard", patientZeroId: "N01", dailyBudget: 7500 };
const bonus: Order = { nodeId: "N01", kind: "prevention" };

describe("spontaneous lab events", () => {
  test("are reproducible and grant a free one-day prevention order", () => {
    const match = Array.from({ length: 100 }, (_, seed) => ({ seed, event: createLabEvent(seed, 1) })).find((item) => item.event)!;
    const { seed, event } = match;
    if (!event) throw new Error("Expected a deterministic lab event");
    expect(createLabEvent(0, 0)).toBeNull();
    expect(createLabEvent(seed, 1)).toEqual(event);
    const game = advanceDay(createGame({ seed, scenario: "standard", patientZeroId: "N01", dailyBudget: 7500 }), [], 0, { nodeId: event.nodeId, kind: "prevention" });
    expect(game.actions[1].preventionNodes).toContain(event.nodeId);
    expect(game.actions[1].budgetSpent).toBe(0);
  });

  test("generates valid sequences, including repeated reagents, with and without incidents", () => {
    expect(createLabEvent(config.seed, 1)).toBeNull();
    expect(createLabEvent(config.seed, 3)).toEqual({ nodeId: "N13", sequence: [2, 0, 2] });
    expect(createLabEvent(config.seed, 7)?.sequence).toEqual([3, 3, 1]);
    for (let day = 1; day <= 40; day++) {
      const event = createLabEvent(config.seed, day);
      if (!event) continue;
      expect(NODE_MAP[event.nodeId]).toBeDefined();
      expect(event.sequence).toHaveLength(3);
      expect(event.sequence.every((value) => Number.isInteger(value) && value >= 0 && value < 4)).toBe(true);
    }
  });

  test("bonus has the same effect as paid prevention, costs zero, and expires next day", () => {
    const initial = createGame(config);
    const free = advanceDay(initial, [], 1200, bonus);
    const paid = advanceDay(initial, [bonus], 1200);
    expect(free.timeline[1].nodes).toEqual(paid.timeline[1].nodes);
    expect(free.actions[1].budgetSpent).toBe(1200);
    expect(free.actions[1].summaryText).toContain("apoyo de laboratorio");
    expect(advanceDay(free, [], 1200).actions[2].preventionNodes).toEqual([]);
    expect(advanceDay(initial, [], 1200, bonus)).toEqual(free);
    expect(initial.actions).toEqual({});
  });

  test("does not stack duplicate prevention or bypass order validation and budget", () => {
    const initial = createGame(config);
    expect(advanceDay(initial, [bonus], 0, bonus).actions[1].preventionNodes).toEqual(["N01"]);
    expect(() => advanceDay(initial, [], 0, { nodeId: "missing", kind: "prevention" })).toThrow("inválidas");
    expect(() => advanceDay(initial, [], 0, { nodeId: "N01", kind: "vaccine" })).toThrow("inválidas");
    const expensive: Order[] = Object.keys(NODE_MAP).map((nodeId) => ({ nodeId, kind: "vaccine" }));
    expect(() => advanceDay(initial, expensive, 2200, bonus)).toThrow("Presupuesto");
    expect(() => advanceDay({ ...initial, status: "won" }, [], 0, bonus)).toThrow("terminó");
  });
});
