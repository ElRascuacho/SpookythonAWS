import { describe, expect, test } from "bun:test";
import {
  advanceDay,
  createGame,
  getPlanCost,
  type GameConfig,
  type Order,
} from "../cureGame";
import { TOTAL_MANTA_POPULATION } from "../mantaGraph";
import { runSingleSeirSimulation } from "../seirEngine";
import { computePercentile } from "../monteCarlo";

const config: GameConfig = {
  seed: 20261030,
  scenario: "standard",
  patientZeroId: "N01",
  dailyBudget: 1000,
};

describe("Cure game", () => {
  test("starts before interventions; budget, duplicates and configuration are validated", () => {
    const game = createGame(config);
    expect(game.timeline[0].totalR).toBe(0);
    expect(game.timeline[0].cumulativeInfected).toBe(85);
    const automatic = runSingleSeirSimulation(
      { ...game.params, days: 3 },
      "SMART_CORTAFUEGOS",
      0,
    );
    expect(automatic.timeline[0].action.budgetSpent).toBe(0);
    expect(automatic.timeline[0].totalR).toBe(0);
    expect(automatic.totalBudgetSpent).toBeLessThanOrEqual(
      3 * config.dailyBudget,
    );
    expect(getPlanCost([{ nodeId: "N01", kind: "cordon" }], 500)).toBe(800);
    expect(() =>
      advanceDay(
        game,
        [
          { nodeId: "N01", kind: "cordon" },
          { nodeId: "N02", kind: "cordon" },
        ],
        500,
      ),
    ).toThrow("Presupuesto");
    expect(() =>
      advanceDay(
        game,
        [
          { nodeId: "N01", kind: "vaccine" },
          { nodeId: "N01", kind: "vaccine" },
        ],
        250,
      ),
    ).toThrow("brigada");
    expect(() => createGame({ ...config, seed: NaN })).toThrow();
    expect(() => createGame({ ...config, patientZeroId: "missing" })).toThrow();
    expect(() =>
      advanceDay(game, [{ nodeId: "missing", kind: "cordon" }], 0),
    ).toThrow();
    expect(advanceDay(game, [], 0).research).toBe(0);
    expect(computePercentile([0, 10, 20], 10)).toBe(2);
    expect(computePercentile([0, 10, 20], 90)).toBe(18);
  });

  test("decisions are reproducible, population conserved and brigades last one day", () => {
    const orders: Order[] = [
      { nodeId: "N01", kind: "vaccine" },
      { nodeId: "N01", kind: "cordon" },
    ];
    const a = advanceDay(createGame(config), orders, 500);
    const b = advanceDay(createGame(config), orders, 500);
    expect(a).toEqual(b);
    expect(a.research).toBe(5);
    expect(a.timeline[1].action.budgetSpent).toBe(1000);
    expect(a.timeline[1].nodes.N01.vaccinatedToday).toBeGreaterThan(0);
    expect(a.timeline[1].nodes.N01.cordonedToday).toBe(true);
    const next = advanceDay(a, [], 250);
    expect(next.timeline[2].nodes.N01.cordonedToday).toBe(false);
    expect(next.research).toBe(8);
    for (const day of next.timeline) {
      expect(day.totalS + day.totalE + day.totalI + day.totalR).toBe(
        TOTAL_MANTA_POPULATION,
      );
      expect(day.action.budgetSpent).toBeLessThanOrEqual(config.dailyBudget);
    }
  });

  test("a containment + priority research strategy can win; inaction loses", () => {
    let game = createGame(config);
    while (game.status === "playing") {
      const nodes = game.timeline[game.day].nodes;
      const focus = Object.keys(nodes).sort(
        (a, b) => nodes[b].I - nodes[a].I,
      )[0];
      const orders: Order[] = [{ nodeId: focus, kind: "cordon" }];
      if (nodes[focus].S > 0) orders.push({ nodeId: focus, kind: "vaccine" });
      game = advanceDay(game, orders, 500);
    }
    expect(game.status).toBe("won");
    expect(game.day).toBe(20);
    expect(game.research).toBe(100);
    expect(() => advanceDay(game, [], 0)).toThrow("terminó");
    let idle = createGame(config);
    while (idle.status === "playing") idle = advanceDay(idle, [], 0);
    expect(idle.status).toBe("lost");
    expect(idle.day).toBeLessThanOrEqual(40);
  });
});
