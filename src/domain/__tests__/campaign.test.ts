import { describe, expect, test } from "bun:test";
import { CHAPTERS, campaignStatus, type CampaignChapter } from "../campaign";
import { advanceDay, createGame, type Order } from "../cureGame";

const config = { seed: 20261030, scenario: "standard" as const, patientZeroId: "N01", dailyBudget: 7500 };

describe("Campaign", () => {
  test("each chapter has a reproducible winning plan within its deadline", () => {
    for (const chapter of [0, 1, 2] as CampaignChapter[]) {
      const initial = createGame({ ...config, campaignChapter: chapter, patientZeroId: CHAPTERS[chapter].nodeId });
      const play = () => {
        let game = initial;
        while (game.status === "playing") {
          const nodes = game.timeline[game.day].nodes;
          const focus = chapter === 1 ? "N15" : Object.keys(nodes).sort((a, b) => nodes[b].I - nodes[a].I)[0];
          const orders: Order[] = [{ nodeId: focus, kind: "cordon" }];
          if (nodes[focus].S > 0) orders.push({ nodeId: focus, kind: "vaccine" });
          game = advanceDay(game, orders, 2200);
        }
        return game;
      };
      const final = play();
      expect(final.status).toBe("won");
      expect(final.day).toBe(CHAPTERS[chapter].days);
      expect(play()).toEqual(final);
      expect(() => advanceDay(final, [], 0)).toThrow();
    }
  });

  test("objectives fail honestly at deadlines and critical thresholds", () => {
    let uncontained = createGame({ ...config, campaignChapter: 0, patientZeroId: "N04" });
    while (uncontained.status === "playing") uncontained = advanceDay(uncontained, [], 1200);
    expect(uncontained.status).toBe("lost");
    const snapshot = createGame(config).timeline[0];
    expect(campaignStatus(0, 6, snapshot, 14)).toBe("lost");
    expect(campaignStatus(0, 6, snapshot, 15)).toBe("won");
    expect(campaignStatus(0, 6, { ...snapshot, nodes: { ...snapshot.nodes, N04: { ...snapshot.nodes.N04, I: 101 } } }, 15)).toBe("lost");
    expect(campaignStatus(0, 1, { ...snapshot, hospitalCollapsed: true }, 15)).toBe("lost");
    expect(campaignStatus(1, 8, snapshot, 100)).toBe("lost");
    const protectedPort = { ...snapshot, nodes: { ...snapshot.nodes, N15: { ...snapshot.nodes.N15, R: 1800, I: 500 } } };
    expect(campaignStatus(1, 8, protectedPort, 0)).toBe("won");
    expect(campaignStatus(1, 1, { ...protectedPort, nodes: { ...protectedPort.nodes, N15: { ...protectedPort.nodes.N15, I: 501 } } }, 0)).toBe("lost");
    expect(campaignStatus(2, 20, snapshot, 99)).toBe("lost");
    expect(campaignStatus(2, 20, snapshot, 100)).toBe("won");
    expect(() => createGame({ ...config, campaignChapter: 3 as CampaignChapter })).toThrow();
  });
});
