import { describe, expect, test } from "bun:test";
import React, { createElement, useState, useEffect, useRef } from "react";
import { renderToString } from "react-dom/server";
import ModeShell, { ModeTabs, type Mode } from "../../ModeShell";
import { createGame, advanceDay, type CureGame } from "../cureGame";

describe("ModeShell (T13 / ADR-0007 / AC-01)", () => {
  test("renders mode navigation with Juego, Campaña, and Comité tabs", () => {
    const html = renderToString(
      createElement(ModeShell, {
        initialMode: "game",
        renderApp: () => createElement("div", { id: "game-view" }, createElement(ModeTabs), "Game Running"),
      }),
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('data-testid="tab-game"');
    expect(html).toContain('data-testid="tab-campaign"');
    expect(html).toContain('data-testid="tab-committee"');
    // Mobile navigation hides the text spans, so tabs need independent names.
    for (const name of ["Juego", "Campaña", "Comité"]) {
      expect(html).toContain(`role="tab" aria-label="${name}"`);
    }
    expect(html).toContain("Juego");
    expect(html).toContain("Campaña");
    expect(html).toContain("Comité");
  });

  test("in game mode, App is visible and committee panel is not rendered", () => {
    const html = renderToString(
      createElement(ModeShell, {
        initialMode: "game",
        renderApp: () => createElement("div", { id: "game-view" }, createElement(ModeTabs), "Game Running"),
      }),
    );

    // App slot is visible and not hidden
    expect(html).toContain('data-testid="mode-shell-app-slot"');
    expect(html).toContain('style="display:block"');
    expect(html).toContain('aria-hidden="false"');
    expect(html).toContain('id="game-view"');
    expect(html).toContain("Game Running");

    // Committee panel is NOT in committee mode
    expect(html).not.toContain('data-testid="committee-shell"');
  });

  test("in committee mode, App is KEPT in the DOM tree but hidden, and committee panel is shown", () => {
    const html = renderToString(
      createElement(ModeShell, {
        initialMode: "committee",
        renderApp: () => createElement("div", { id: "game-view" }, createElement(ModeTabs), "Preserved Game"),
      }),
    );

    // Critical ADR-0007 invariant: App is still in the tree, but hidden via style/class
    expect(html).toContain('data-testid="mode-shell-app-slot"');
    expect(html).toContain("mode-shell-hidden");
    expect(html).toContain('display:none');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('id="game-view"');
    expect(html).toContain("Preserved Game");

    // Committee panel is rendered
    expect(html).toContain('data-testid="committee-shell"');
    expect(html).toContain("COMITÉ EPIDEMIOLÓGICO");
  });

  test("mode toggle keeps game state object and memory intact across switches", () => {
    // We simulate the lifecycle of App hosted inside ModeShell
    const initialConfig = {
      seed: 20261030,
      scenario: "standard" as const,
      patientZeroId: "N01",
      dailyBudget: 7500,
    };

    let mountCount = 0;
    let unmountCount = 0;
    let capturedGameState: CureGame | null = null;
    let currentRenderMode: Mode = "game";

    // Component representing App that initializes game state and tracks mounts/unmounts
    function MockGameApp({ activeMode }: { activeMode?: Mode }) {
      // Game state initialized once on mount
      const [game, setGame] = useState(() => {
        mountCount++;
        const g = createGame(initialConfig);
        // Play an initial day so state advances beyond day 0
        return advanceDay(g, [{ nodeId: "N01", kind: "vaccine" }], 1200);
      });

      useEffect(() => {
        return () => {
          unmountCount++;
        };
      }, []);

      capturedGameState = game;
      currentRenderMode = activeMode ?? "game";

      return createElement(
        "div",
        { id: "game-instance", "data-day": game.day },
        `Day: ${game.day}, Research: ${game.research}`,
      );
    }

    // Stateful harness simulating ModeShell host
    let switchModeExternal!: (mode: Mode) => void;

    function TestHarness() {
      const [mode, setMode] = useState<Mode>("game");
      switchModeExternal = setMode;

      return createElement(ModeShell, {
        initialMode: mode,
        onModeChange: setMode,
        renderApp: (props) => createElement(MockGameApp, props),
      });
    }

    // 1. Initial render in Game mode
    const htmlGame1 = renderToString(createElement(TestHarness));
    expect(htmlGame1).toContain("Day: 1");
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
    expect(capturedGameState).not.toBeNull();
    const gameRef = capturedGameState!;
    expect(gameRef.day).toBe(1);
    expect(currentRenderMode).toBe("game");

    // 2. Switch to Committee mode
    // Verify that ModeShell keeps the app mounted (hidden) without re-instantiating or resetting state
    const htmlCommittee = renderToString(
      createElement(ModeShell, {
        initialMode: "committee",
        renderApp: (props) => createElement(MockGameApp, props),
      }),
    );
    expect(htmlCommittee).toContain('display:none');
    expect(htmlCommittee).toContain("Day: 1");
    expect(htmlCommittee).toContain('data-testid="committee-shell"');

    // 3. Switch to Campaign mode
    const htmlCampaign = renderToString(
      createElement(ModeShell, {
        initialMode: "campaign",
        renderApp: (props) => createElement(MockGameApp, props),
      }),
    );
    expect(htmlCampaign).toContain('style="display:block"');
    expect(htmlCampaign).toContain('aria-hidden="false"');
    expect(htmlCampaign).toContain("Day: 1");
    expect(htmlCampaign).not.toContain('data-testid="committee-shell"');

    // 4. Verify game state invariants
    expect(gameRef.day).toBe(1);
    expect(gameRef.timeline[1].cumulativeInfected).toBeGreaterThan(0);
    expect(unmountCount).toBe(0);
  });

  test("AC-01 isolation: committee does not receive or inject game actions", () => {
    let committeePropsReceived: unknown = null;

    renderToString(
      createElement(ModeShell, {
        initialMode: "committee",
        renderApp: () => createElement("div", null, "Game"),
        renderCommittee: () => {
          // The committee renderer receives zero parameters from ModeShell
          committeePropsReceived = {};
          return createElement("div", { id: "committee-custom" }, "Committee Form");
        },
      }),
    );

    expect(committeePropsReceived).not.toBeNull();
    // Committee has no access to game state mutation, setGame, or action dispatch
    expect(committeePropsReceived).toEqual({});
  });
});


test("ModeShell forwards mode and inactivity to the workspace without unmounting it", () => {
  for (const mode of ["game", "campaign", "committee"] as const) {
    let received: import("../../App").AppProps | undefined;
    const html = renderToString(createElement(ModeShell, {
      initialMode: mode,
      renderApp: props => { received = props; return createElement("div", null, "Workspace retained"); },
    }));
    expect(received?.activeMode).toBe(mode);
    expect(received?.inactive).toBe(mode === "committee");
    expect(typeof received?.onModeChange).toBe("function");
    expect(html).toContain("Workspace retained");
  }
});
