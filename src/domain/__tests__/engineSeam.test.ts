import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SIMULATION_PARAMS,
  MANTA_NODES,
  TOTAL_MANTA_POPULATION,
} from "../mantaGraph";
import { createSeededRng } from "../prng";
import { runSingleSeirSimulation, type SingleSimulationOptions } from "../seirEngine";
import { decideDailyAction } from "../strategies";
import type { DailyAction, StrategyType } from "../types";

describe("T1 Engine Seam — runSingleSeirSimulation 5th options argument & parity", () => {
  const testSeeds = [0, 42, 20261030, 99991234];
  const strategies: StrategyType[] = ["SMART_CORTAFUEGOS", "RANDOM", "NO_INTERVENTION"];

  test("Parity: 4-argument calls yield 100% bit-identical results with and without undefined 5th argument", () => {
    for (const seed of testSeeds) {
      const params = {
        ...DEFAULT_SIMULATION_PARAMS,
        seed,
        days: 40,
      };

      for (const strategy of strategies) {
        for (const runIndex of [0, 1, 3]) {
          const run4Args = runSingleSeirSimulation(params, strategy, runIndex);
          const run5ArgsUndefined = runSingleSeirSimulation(
            params,
            strategy,
            runIndex,
            undefined,
            undefined,
          );
          const run5ArgsEmpty = runSingleSeirSimulation(
            params,
            strategy,
            runIndex,
            undefined,
            {},
          );

          expect(run5ArgsUndefined).toEqual(run4Args);
          expect(run5ArgsEmpty).toEqual(run4Args);
        }
      }
    }
  });

  test("envNamespace option: overrides environmental RNG stream while preserving determinism", () => {
    const params = {
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 20261030,
      days: 30,
    };

    // When envNamespace is explicitly provided, it overrides the strategy-based env seed.
    // If we run two simulations with NO_INTERVENTION using the same custom envNamespace, they must be identical.
    const runA = runSingleSeirSimulation(params, "NO_INTERVENTION", 0, undefined, {
      envNamespace: "COUPLED_ENVIRONMENT",
    });
    const runB = runSingleSeirSimulation(params, "NO_INTERVENTION", 0, undefined, {
      envNamespace: "COUPLED_ENVIRONMENT",
    });

    expect(runA).toEqual(runB);

    // Furthermore, runA should differ from default NO_INTERVENTION (which uses "NO_INTERVENTION" as namespace)
    const runDefault = runSingleSeirSimulation(params, "NO_INTERVENTION", 0);
    expect(runA.totalCumulativeInfected).not.toBe(runDefault.totalCumulativeInfected);

    // But passing envNamespace: "NO_INTERVENTION" explicitly must match runDefault exactly
    const runExplicitDefault = runSingleSeirSimulation(
      params,
      "NO_INTERVENTION",
      0,
      undefined,
      { envNamespace: "NO_INTERVENTION" },
    );
    expect(runExplicitDefault).toEqual(runDefault);
  });

  test("onDailyDecision option: intercepts daily decisions while respecting domain invariants", () => {
    const params = {
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 20261030,
      days: 25,
      dailyBudget: 5000,
    };

    const decisionsCalled: number[] = [];
    const customOptions: SingleSimulationOptions = {
      onDailyDecision: (day, state, p) => {
        decisionsCalled.push(day);

        // Vaccinate up to 100 on N01 if susceptible exists, spend 2500
        const n01S = state["N01"]?.S ?? 0;
        const doses = Math.min(100, n01S);

        return {
          day,
          vaccinatedNodes: (doses > 0 ? { N01: doses } : {}) as Record<string, number>,
          fumigatedNodes: ["N02"],
          cordonedNodes: [],
          cordonedEdges: [],
          budgetSpent: 2500,
          summaryText: `Custom policy day ${day}`,
        };
      },
    };

    const run = runSingleSeirSimulation(
      params,
      "SMART_CORTAFUEGOS",
      0,
      undefined,
      customOptions,
    );

    // Decision callback called for days 1..days (day 0 is initial state)
    expect(decisionsCalled.length).toBe(params.days);
    expect(decisionsCalled[0]).toBe(1);
    expect(decisionsCalled[decisionsCalled.length - 1]).toBe(params.days);

    // Verification of Golden Rule and Conservation of Population
    expect(run.wastedDosesOnInfected).toBe(0);
    expect(run.totalBudgetSpent).toBe(2500 * params.days);

    for (const snap of run.timeline) {
      const sumTotal = snap.totalS + snap.totalE + snap.totalI + snap.totalR;
      expect(sumTotal).toBe(TOTAL_MANTA_POPULATION);

      for (const node of MANTA_NODES) {
        const nSnap = snap.nodes[node.id];
        expect(nSnap.S).toBeGreaterThanOrEqual(0);
        expect(nSnap.E).toBeGreaterThanOrEqual(0);
        expect(nSnap.I).toBeGreaterThanOrEqual(0);
        expect(nSnap.R).toBeGreaterThanOrEqual(0);
        expect(nSnap.S + nSnap.E + nSnap.I + nSnap.R).toBe(node.population);
      }
    }
  });

  test("onDailyDecision mirroring decideDailyAction reproduces standard strategy run exactly", () => {
    const params = {
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 42,
      days: 35,
    };
    const strategy: StrategyType = "SMART_CORTAFUEGOS";
    const runIndex = 2;

    const normalRun = runSingleSeirSimulation(params, strategy, runIndex);

    // Mirror decideDailyAction using a fresh strategyRng matching internal derivation
    const strategyRng = createSeededRng(
      params.seed ^ 0x13579bdf,
      `${strategy}_DECISION`,
      runIndex,
    );

    const mirroredRun = runSingleSeirSimulation(
      params,
      strategy,
      runIndex,
      undefined,
      {
        onDailyDecision: (day, state, p) =>
          decideDailyAction(day, state, p, strategy, strategyRng),
      },
    );

    expect(mirroredRun).toEqual(normalRun);
  });

  test("manualActions takes precedence over options.onDailyDecision per ADR-0011", () => {
    const params = {
      ...DEFAULT_SIMULATION_PARAMS,
      seed: 20261030,
      days: 5,
    };

    let onDailyDecisionCalled = false;
    const manualActions: Record<number, DailyAction> = {
      1: {
        day: 1,
        vaccinatedNodes: {},
        fumigatedNodes: [],
        cordonedNodes: [],
        cordonedEdges: [],
        budgetSpent: 999,
        summaryText: "Manual action day 1",
      },
    };

    const run = runSingleSeirSimulation(
      params,
      "SMART_CORTAFUEGOS",
      0,
      manualActions,
      {
        onDailyDecision: () => {
          onDailyDecisionCalled = true;
          return {
            day: 1,
            vaccinatedNodes: {},
            fumigatedNodes: [],
            cordonedNodes: [],
            cordonedEdges: [],
            budgetSpent: 111,
            summaryText: "Options decision day 1",
          };
        },
      },
    );

    expect(onDailyDecisionCalled).toBe(false);
    expect(run.timeline[1].action.budgetSpent).toBe(999);
  });
});
