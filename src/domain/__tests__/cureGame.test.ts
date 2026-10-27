import { describe, expect, test } from "bun:test";
import {
  advanceDay,
  createGame,
  getPlanCost,
  INTERVENTIONS,
  LOSS_THRESHOLD,
  type GameConfig,
  type Order,
} from "../cureGame";
import { BUDGET_LEVELS, ECONOMY } from "../economy";
import { TOTAL_MANTA_POPULATION } from "../mantaGraph";
import { runSingleSeirSimulation } from "../seirEngine";
import { computePercentile } from "../monteCarlo";

const config: GameConfig = {
  seed: 20261030,
  scenario: "standard",
  patientZeroId: "N01",
  dailyBudget: 7500,
};

describe("Cure game", () => {
  test("isolation and prevention affect the selected zone for one day", () => {
    const game = createGame(config);
    const orders: Order[] = [
      { nodeId: "N01", kind: "isolation" },
      { nodeId: "N01", kind: "prevention" },
    ];
    const baseline = advanceDay(game, [], 0);
    const treated = advanceDay(game, orders, 0);
    expect(treated.actions[1].isolatedNodes).toEqual(["N01"]);
    expect(treated.actions[1].preventionNodes).toEqual(["N01"]);
    expect(treated.actions[1].budgetSpent).toBe(2000);
    expect(treated.timeline[1].nodes.N01.S).toBeGreaterThan(baseline.timeline[1].nodes.N01.S);
    for (const order of orders) {
      expect(advanceDay(game, [order], 0).timeline[1].nodes.N01.S)
        .toBeGreaterThan(baseline.timeline[1].nodes.N01.S);
    }
    expect(advanceDay(game, orders, 0)).toEqual(treated);
    const next = advanceDay(treated, [], 0);
    expect(next.actions[2].isolatedNodes).toEqual([]);
    expect(next.actions[2].preventionNodes).toEqual([]);
    expect(() => advanceDay(game, [orders[0], orders[0]], 0)).toThrow("brigada");
  });
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
    expect(BUDGET_LEVELS).toEqual(ECONOMY.dailyBudgetLevels);
    expect(getPlanCost([{ nodeId: "N01", kind: "cordon" }], 1200)).toBe(3100);
    expect(
      getPlanCost(
        [
          { nodeId: "N01", kind: "cordon" },
          { nodeId: "N02", kind: "vaccine" },
          { nodeId: "N03", kind: "fumigate" },
        ],
        ECONOMY.researchPriorityUsd,
      ),
    ).toBe(
      ECONOMY.cordonUsd +
        ECONOMY.vaccineLotUsd +
        ECONOMY.fumigationUsd +
        ECONOMY.researchPriorityUsd,
    );
    expect(() =>
      advanceDay(
        game,
        [
          { nodeId: "N01", kind: "cordon" },
          { nodeId: "N01", kind: "vaccine" },
          { nodeId: "N01", kind: "fumigate" },
        ],
        ECONOMY.researchPriorityUsd,
      ),
    ).toThrow("Presupuesto");
    expect(() =>
      advanceDay(
        game,
        [
          { nodeId: "N01", kind: "vaccine" },
          { nodeId: "N01", kind: "vaccine" },
        ],
        0,
      ),
    ).toThrow("brigada");
    expect(() => createGame({ ...config, seed: NaN })).toThrow();
    expect(() => createGame({ ...config, patientZeroId: "missing" })).toThrow();
    expect(() => createGame({ ...config, dailyBudget: 1000 })).toThrow();
    expect(() => createGame({ ...config, dailyBudget: 5000 })).toThrow();
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
    const a = advanceDay(createGame(config), orders, 2200);
    const b = advanceDay(createGame(config), orders, 2200);
    expect(a).toEqual(b);
    expect(a.research).toBe(5);
    expect(a.timeline[1].action.budgetSpent).toBe(
      INTERVENTIONS.vaccine.cost +
        INTERVENTIONS.cordon.cost +
        ECONOMY.researchPriorityUsd,
    );
    expect(a.timeline[1].action.budgetSpent).toBe(6500);
    expect(a.timeline[1].nodes.N01.vaccinatedToday).toBeGreaterThan(0);
    expect(a.timeline[1].nodes.N01.cordonedToday).toBe(true);
    const next = advanceDay(a, [], 1200);
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
      game = advanceDay(game, orders, ECONOMY.researchPriorityUsd);
    }
    expect(game.status).toBe("won");
    expect(game.day).toBe(20);
    expect(game.research).toBe(100);
    const finalDay = game.timeline[game.day];
    expect(finalDay.cumulativeInfected).toBe(13552);
    expect(finalDay.cumulativeInfected).toBeLessThan(
      TOTAL_MANTA_POPULATION * LOSS_THRESHOLD,
    );
    expect(() => advanceDay(game, [], 0)).toThrow("terminó");
    let idle = createGame(config);
    while (idle.status === "playing") idle = advanceDay(idle, [], 0);
    expect(idle.status).toBe("lost");
    expect(idle.day).toBe(19);
    expect(idle.timeline[idle.day].cumulativeInfected).toBeGreaterThanOrEqual(
      TOTAL_MANTA_POPULATION * LOSS_THRESHOLD,
    );
  });

  test("standard research alone cannot reach the cure before the city is overwhelmed", () => {
    let game = createGame(config);
    while (game.status === "playing") {
      const nodes = game.timeline[game.day].nodes;
      const focus = Object.keys(nodes).sort(
        (a, b) => nodes[b].I - nodes[a].I,
      )[0];
      const orders: Order[] = [{ nodeId: focus, kind: "cordon" }];
      if (nodes[focus].S > 0) orders.push({ nodeId: focus, kind: "vaccine" });
      game = advanceDay(game, orders, ECONOMY.researchStandardUsd);
    }
    expect(game.status).toBe("lost");
    expect(game.research).toBeLessThan(100);
  });
});
