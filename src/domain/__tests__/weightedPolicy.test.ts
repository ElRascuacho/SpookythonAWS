import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SIMULATION_PARAMS,
  MANTA_NODES,
  TOTAL_MANTA_POPULATION,
} from "../mantaGraph";
import { createSeededRng } from "../prng";
import { runSingleSeirSimulation } from "../seirEngine";
import { decideDailyAction } from "../strategies";
import type { CompartmentState, SimulationParams } from "../types";
import {
  createWeightedPolicy,
  decideWeightedAction,
  WEIGHT_BOUNDS,
  ZERO_POLICY_WEIGHTS,
} from "../committee";

describe("T2 Weighted Policy — Explainable 4-weight policy & SGC zero-vector parity", () => {
  const fixtureSeeds = [0, 42, 20261030, 987654321, 99991234];
  const testHorizons = [20, 30, 40, 60];

  test("Parity: zero-vector [0, 0, 0, 0] produces 100% bit-identical results to source SGC across fixture seeds", () => {
    for (const seed of fixtureSeeds) {
      for (const H of testHorizons) {
        const params: SimulationParams = {
          ...DEFAULT_SIMULATION_PARAMS,
          seed,
          days: H,
        };

        for (const runIndex of [0, 1, 7]) {
          const expectedSgcRun = runSingleSeirSimulation(
            params,
            "SMART_CORTAFUEGOS",
            runIndex,
          );

          const weightedZeroRun = runSingleSeirSimulation(
            params,
            "SMART_CORTAFUEGOS",
            runIndex,
            undefined,
            {
              onDailyDecision: createWeightedPolicy(ZERO_POLICY_WEIGHTS),
            },
          );

          expect(weightedZeroRun).toEqual(expectedSgcRun);
          expect(weightedZeroRun.totalCumulativeInfected).toBe(
            expectedSgcRun.totalCumulativeInfected,
          );
          expect(weightedZeroRun.totalBudgetSpent).toBe(
            expectedSgcRun.totalBudgetSpent,
          );
          expect(weightedZeroRun.timeline.length).toBe(
            expectedSgcRun.timeline.length,
          );

          for (let d = 0; d <= H; d++) {
            expect(weightedZeroRun.timeline[d].action).toEqual(
              expectedSgcRun.timeline[d].action,
            );
          }
        }
      }
    }
  });

  test("Parity: decideWeightedAction with zero weights deeply equals decideDailyAction for SGC on identical state", () => {
    const dummyRng = createSeededRng(12345, "TEST", 0);
    const params: SimulationParams = {
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 20261030,
      days: 40,
    };

    // Synthesize an active outbreak state across several nodes
    const mockState: Record<string, CompartmentState> = {};
    for (const node of MANTA_NODES) {
      mockState[node.id] = {
        S: Math.round(node.population * 0.8),
        E: Math.round(node.population * 0.05),
        I: Math.round(node.population * 0.1),
        R: Math.round(node.population * 0.05),
        vectorIndex: 0.5,
      };
    }

    for (let day = 0; day <= 40; day++) {
      const sgcAction = decideDailyAction(
        day,
        mockState,
        params,
        "SMART_CORTAFUEGOS",
        dummyRng,
      );
      const weightedAction = decideWeightedAction(
        day,
        mockState,
        params,
        ZERO_POLICY_WEIGHTS,
      );

      expect(weightedAction.day).toBe(sgcAction.day);
      expect(weightedAction.budgetSpent).toBe(sgcAction.budgetSpent);
      expect(weightedAction.cordonedNodes).toEqual(sgcAction.cordonedNodes);
      expect(weightedAction.cordonedEdges).toEqual(sgcAction.cordonedEdges);
      expect(weightedAction.fumigatedNodes).toEqual(sgcAction.fumigatedNodes);
      expect(weightedAction.vaccinatedNodes).toEqual(sgcAction.vaccinatedNodes);
    }
  });

  test("Domain Invariants (AC-06 / AC-10): population conservation, zero wasted doses, budget caps", () => {
    const params: SimulationParams = {
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 20261030,
      days: 40,
      dailyBudget: 7500,
    };

    const testWeightVectors = [
      [0, 0, 0, 0],
      [2.5, -1.0, -2.0, 1.5],
      [-3.0, 3.0, 3.0, -3.0],
      [1.0, 1.0, 1.0, 1.0],
      [-2.5, -2.5, -2.5, -2.5],
    ] as const;

    for (const weights of testWeightVectors) {
      const run = runSingleSeirSimulation(
        params,
        "SMART_CORTAFUEGOS",
        0,
        undefined,
        {
          onDailyDecision: createWeightedPolicy(weights),
        },
      );

      expect(run.wastedDosesOnInfected).toBe(0);
      expect(run.timeline.length).toBe(params.days + 1);

      for (const snap of run.timeline) {
        expect(snap.action.budgetSpent).toBeGreaterThanOrEqual(0);
        expect(snap.action.budgetSpent).toBeLessThanOrEqual(params.dailyBudget);

        const totalPop = snap.totalS + snap.totalE + snap.totalI + snap.totalR;
        expect(totalPop).toBe(TOTAL_MANTA_POPULATION);

        for (const node of MANTA_NODES) {
          const ns = snap.nodes[node.id];
          expect(Number.isFinite(ns.S)).toBe(true);
          expect(Number.isFinite(ns.E)).toBe(true);
          expect(Number.isFinite(ns.I)).toBe(true);
          expect(Number.isFinite(ns.R)).toBe(true);
          expect(ns.S).toBeGreaterThanOrEqual(0);
          expect(ns.E).toBeGreaterThanOrEqual(0);
          expect(ns.I).toBeGreaterThanOrEqual(0);
          expect(ns.R).toBeGreaterThanOrEqual(0);
          expect(ns.S + ns.E + ns.I + ns.R).toBe(node.population);
        }
      }
    }
  });

  test("Weight responsiveness: non-zero weights shift priorities between cordons and fumigations", () => {
    const params: SimulationParams = {
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 20261030,
      days: 40,
      dailyBudget: 5000,
      cordonCost: 2000,
      fumigationCost: 1500,
    };

    // State with both high transmission threat and high vector index
    const mockState: Record<string, CompartmentState> = {};
    for (const node of MANTA_NODES) {
      mockState[node.id] = {
        S: 5000,
        E: 200,
        I: 100,
        R: 50,
        vectorIndex: 0.8,
      };
    }

    // Heavy cordon preference vs heavy fumigation preference early
    const cordonHeavyAction = decideWeightedAction(
      5,
      mockState,
      params,
      [3.0, -3.0, 0, 0],
    );
    const fumigationHeavyAction = decideWeightedAction(
      5,
      mockState,
      params,
      [-3.0, 3.0, 0, 0],
    );

    expect(cordonHeavyAction.cordonedNodes.length).toBeGreaterThan(0);
    expect(fumigationHeavyAction.fumigatedNodes.length).toBeGreaterThan(0);
    expect(cordonHeavyAction).not.toEqual(fumigationHeavyAction);
  });

  test("Product cutoff: floor(0.45 * H) strictly determines early vs late weight application", () => {
    const H = 40;
    const earlyLastDay = Math.floor(0.45 * H); // 18
    expect(earlyLastDay).toBe(18);

    const params: SimulationParams = {
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 20261030,
      days: H,
    };

    const mockState: Record<string, CompartmentState> = {};
    for (const node of MANTA_NODES) {
      mockState[node.id] = {
        S: 3000,
        E: 100,
        I: 50,
        R: 50,
        vectorIndex: 0.7,
      };
    }

    // weights: early has max cordon [3, -3], late has max fumigation [-3, 3]
    const splitWeights = [3.0, -3.0, -3.0, 3.0] as const;

    const actionDayEarly = decideWeightedAction(18, mockState, params, splitWeights);
    const actionDayLate = decideWeightedAction(19, mockState, params, splitWeights);

    // Day 18 must use early offset 0; Day 19 must use late offset 2
    expect(actionDayEarly.cordonedNodes.length).toBeGreaterThanOrEqual(1);
    expect(actionDayLate.fumigatedNodes.length).toBeGreaterThanOrEqual(1);
    expect(actionDayEarly.cordonedNodes).not.toEqual(actionDayLate.cordonedNodes);
  });

  test("Coordinator requirement: live adaptation recomputes actions from state, not a frozen calendar", () => {
    const params: SimulationParams = {
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 20261030,
      days: 40,
      dailyBudget: 7500,
    };

    const weights = [1.5, 0.5, -0.5, 1.0] as const;

    // 1. Run an undisturbed simulation up to day 10
    const undisturbedRun = runSingleSeirSimulation(
      params,
      "SMART_CORTAFUEGOS",
      0,
      undefined,
      { onDailyDecision: createWeightedPolicy(weights) },
    );

    const day10State = undisturbedRun.timeline[10].nodes;
    const undisturbedDay11Action = decideWeightedAction(
      11,
      day10State,
      params,
      weights,
    );

    // 2. Clone day 10 state and clear N01's outbreak (e.g. successful total cure/clearing)
    // while exploding an outbreak at N03 (ULEAM, high betweenness)
    const perturbedState: Record<string, CompartmentState> = JSON.parse(
      JSON.stringify(day10State),
    );
    perturbedState["N01"].I = 0;
    perturbedState["N01"].E = 0;
    perturbedState["N03"].I = 4000;
    perturbedState["N03"].E = 2000;
    perturbedState["N03"].S = Math.max(0, perturbedState["N03"].S - 6000);

    // 3. Recompute daily action on day 11 with the perturbed state
    const adaptiveDay11Action = decideWeightedAction(
      11,
      perturbedState,
      params,
      weights,
    );

    // Verify that the action dynamically adapts to the new state rather than following a frozen script
    expect(adaptiveDay11Action).not.toEqual(undisturbedDay11Action);
    expect(adaptiveDay11Action.cordonedNodes.includes("N01")).toBe(false);
    expect(adaptiveDay11Action.cordonedNodes.includes("N03")).toBe(true);
  });

  test("Edge cases: day 0 and zero budget return passive monitoring", () => {
    const params: SimulationParams = {
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 20261030,
      days: 40,
      dailyBudget: 0,
    };

    const mockState: Record<string, CompartmentState> = {};
    for (const node of MANTA_NODES) {
      mockState[node.id] = { S: 1000, E: 10, I: 10, R: 0, vectorIndex: 0.1 };
    }

    const day0Action = decideWeightedAction(0, mockState, params, ZERO_POLICY_WEIGHTS);
    expect(day0Action.day).toBe(0);
    expect(day0Action.budgetSpent).toBe(0);
    expect(day0Action.cordonedNodes).toEqual([]);
    expect(day0Action.summaryText).toContain("Día 0");

    const zeroBudgetAction = decideWeightedAction(5, mockState, params, ZERO_POLICY_WEIGHTS);
    expect(zeroBudgetAction.budgetSpent).toBe(0);
    expect(zeroBudgetAction.cordonedNodes).toEqual([]);
  });

  test("Constants & bounds exports", () => {
    expect(WEIGHT_BOUNDS.min).toBe(-3);
    expect(WEIGHT_BOUNDS.max).toBe(3);
    expect(ZERO_POLICY_WEIGHTS).toEqual([0, 0, 0, 0]);
  });
});
