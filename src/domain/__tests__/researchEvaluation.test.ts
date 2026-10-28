import { describe, expect, test } from "bun:test";
import { evaluateMeasureImpact } from "../researchEvaluation";
import { researchMeasure } from "./fixtures/researchMeasure";
import { DEFAULT_SIMULATION_PARAMS } from "../mantaGraph";

describe("Research Measure Pre-Evaluation Engine", () => {
  test("evaluates a valid measure against SEIR baseline within budget and limits", () => {
    const evaluation = evaluateMeasureImpact(researchMeasure, DEFAULT_SIMULATION_PARAMS);

    expect(typeof evaluation.infectionsAvoided).toBe("number");
    expect(evaluation.infectionsAvoided).toBeGreaterThanOrEqual(0);

    expect(typeof evaluation.peakReductionPercent).toBe("number");
    expect(evaluation.peakReductionPercent).toBeGreaterThanOrEqual(0);
    expect(evaluation.peakReductionPercent).toBeLessThanOrEqual(100);

    expect(typeof evaluation.estimatedCostUsd).toBe("number");
    expect(evaluation.estimatedCostUsd).toBeGreaterThanOrEqual(0);

    expect(typeof evaluation.budgetViable).toBe("boolean");
    expect(typeof evaluation.hospitalRelieved).toBe("boolean");

    expect(evaluation.baselinePeakInfected).toBeGreaterThan(0);
    expect(evaluation.simulatedPeakInfected).toBeGreaterThan(0);
  });

  test("runs deterministically under identical parameters", () => {
    const first = evaluateMeasureImpact(researchMeasure, DEFAULT_SIMULATION_PARAMS);
    const second = evaluateMeasureImpact(researchMeasure, DEFAULT_SIMULATION_PARAMS);

    expect(first.infectionsAvoided).toBe(second.infectionsAvoided);
    expect(first.peakReductionPercent).toBe(second.peakReductionPercent);
    expect(first.estimatedCostUsd).toBe(second.estimatedCostUsd);
    expect(first.baselinePeakInfected).toBe(second.baselinePeakInfected);
    expect(first.simulatedPeakInfected).toBe(second.simulatedPeakInfected);
  });
});
