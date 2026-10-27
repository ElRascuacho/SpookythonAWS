import { describe, expect, it } from "bun:test";
import {
  SimulationParamsSchema,
  PartialSimulationParamsSchema,
} from "../schemas/simulationParams.schema";
import {
  CreateSessionRequestSchema,
  CreateJobRequestSchema,
  JobStatusResponseSchema,
  JobListResponseSchema,
  JobResultsResponseSchema,
  ApiErrorResponseSchema,
} from "../schemas/api.schema";
import { AIPolicySpecSchema } from "../schemas/aiPolicy.schema";

describe("SimulationParamsSchema Validation", () => {
  it("validates valid default-like simulation parameters", () => {
    const validParams = {
      betaHuman: 0.35,
      betaVector: 0.12,
      sigma: 0.33,
      gamma: 0.1,
      hospitalCapacity: 2500,
      vaccineEfficacy: 0.85,
      dailyBudget: 1000,
      vaccineCost: 200,
      vaccineBatchSize: 500,
      fumigationCost: 250,
      cordonCost: 300,
      days: 60,
      seed: 20261030,
      monteCarloRuns: 100,
      patientZeroIds: ["N01"],
      initialInfectedPerNode: 35,
      initialExposedPerNode: 50,
    };

    const result = SimulationParamsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it("rejects out-of-range days (outside 1..60)", () => {
    expect(SimulationParamsSchema.safeParse({ days: 0 }).success).toBe(false);
    expect(SimulationParamsSchema.safeParse({ days: 61 }).success).toBe(false);
    expect(SimulationParamsSchema.safeParse({ days: -10 }).success).toBe(false);
  });

  it("rejects negative numbers, NaN and floats where integers are required", () => {
    expect(
      SimulationParamsSchema.safeParse({ dailyBudget: -100 }).success,
    ).toBe(false);
    expect(
      SimulationParamsSchema.safeParse({ dailyBudget: NaN }).success,
    ).toBe(false);
    expect(
      SimulationParamsSchema.safeParse({ hospitalCapacity: 2500.5 }).success,
    ).toBe(false);
    expect(
      SimulationParamsSchema.safeParse({ vaccineBatchSize: 0 }).success,
    ).toBe(false);
    expect(
      SimulationParamsSchema.safeParse({ monteCarloRuns: 5 }).success,
    ).toBe(false);
    expect(
      SimulationParamsSchema.safeParse({ monteCarloRuns: 501 }).success,
    ).toBe(false);
  });

  it("rejects invalid transmission rates (outside 0.01..1.0)", () => {
    expect(
      SimulationParamsSchema.safeParse({ betaHuman: 0 }).success,
    ).toBe(false);
    expect(
      SimulationParamsSchema.safeParse({ betaHuman: 1.5 }).success,
    ).toBe(false);
    expect(
      SimulationParamsSchema.safeParse({ vaccineEfficacy: 0.05 }).success,
    ).toBe(false);
  });

  it("rejects non-existent node IDs in patientZeroIds", () => {
    expect(
      SimulationParamsSchema.safeParse({ patientZeroIds: [] }).success,
    ).toBe(false);
    expect(
      SimulationParamsSchema.safeParse({ patientZeroIds: ["N99"] }).success,
    ).toBe(false);
    expect(
      SimulationParamsSchema.safeParse({ patientZeroIds: ["<script>"] }).success,
    ).toBe(false);
  });

  it("rejects unknown extra keys in strict mode", () => {
    const maliciousParams = {
      betaHuman: 0.35,
      betaVector: 0.12,
      sigma: 0.33,
      gamma: 0.1,
      hospitalCapacity: 2500,
      vaccineEfficacy: 0.85,
      dailyBudget: 1000,
      vaccineCost: 200,
      vaccineBatchSize: 500,
      fumigationCost: 250,
      cordonCost: 300,
      days: 30,
      seed: 20261030,
      monteCarloRuns: 50,
      patientZeroIds: ["N01"],
      initialInfectedPerNode: 35,
      initialExposedPerNode: 50,
      extraInjectedProp: "DROP TABLE users;",
    };
    expect(SimulationParamsSchema.safeParse(maliciousParams).success).toBe(
      false,
    );
  });

  it("validates PartialSimulationParamsSchema correctly", () => {
    expect(
      PartialSimulationParamsSchema.safeParse({ days: 30, monteCarloRuns: 50 })
        .success,
    ).toBe(true);
    expect(
      PartialSimulationParamsSchema.safeParse({ days: 100 }).success,
    ).toBe(false);
  });
});

describe("API Schemas Validation", () => {
  it("validates high-entropy invitation code in CreateSessionRequestSchema", () => {
    const validCodes = [
      "MC-98060-B646E-2E482-BCE1F",
      "SPK-A1B2-C3D4-E5F6-7890-ABCD-EF12",
      "4a6f8b9c0d1e2f3a4b5c6d7e8f9a0b1c", // 32 hex chars (128 bits)
    ];

    for (const code of validCodes) {
      expect(CreateSessionRequestSchema.safeParse({ code }).success).toBe(true);
    }

    const invalidCodes = [
      "123",
      "short-code",
      "",
      "password123",
      "A".repeat(150),
    ];

    for (const code of invalidCodes) {
      expect(CreateSessionRequestSchema.safeParse({ code }).success).toBe(false);
    }
  });

  it("validates CreateJobRequestSchema with idempotency key and options", () => {
    const validJob = {
      params: {
        days: 45,
        monteCarloRuns: 100,
      },
      enableAiStrategy: true,
      visibility: "SHARED_INVITEES",
    };

    const res = CreateJobRequestSchema.safeParse(validJob);
    expect(res.success).toBe(true);
  });

  it("rejects invalid visibility in CreateJobRequestSchema", () => {
    const invalidJob = {
      visibility: "PUBLIC_WORLD",
    };
    expect(CreateJobRequestSchema.safeParse(invalidJob).success).toBe(false);
  });

  it("validates uniform ApiErrorResponseSchema", () => {
    const errorResponse = {
      ok: false,
      error: "Recurso no encontrado",
      code: "NOT_FOUND",
      details: { field: "jobId" },
    };
    expect(ApiErrorResponseSchema.safeParse(errorResponse).success).toBe(true);
  });

  it("validates JobStatusResponseSchema", () => {
    const statusPayload = {
      ok: true,
      job: {
        jobId: "019488a0-711e-7f61-b68e-9cb2657e4e11",
        status: "RUNNING",
        createdAt: "2026-10-26T22:00:00.000Z",
        totalRuns: 1500,
        strategies: ["NO_INTERVENTION", "RANDOM", "SMART_CORTAFUEGOS"],
        visibility: "PRIVATE",
        attempt: 1,
      },
    };
    expect(JobStatusResponseSchema.safeParse(statusPayload).success).toBe(true);
  });
});

describe("AIPolicySpecSchema Validation", () => {
  it("accepts valid declarative policy with normalized budget weights", () => {
    const validPolicy = {
      version: "1.0.0",
      budgetAllocation: {
        vaccineRatio: 0.4,
        fumigationRatio: 0.3,
        cordonRatio: 0.3,
      },
      nodePriorityRule: "HIGHEST_INFECTED_FIRST",
      minSusceptibleToVaccinate: 100,
      vectorThresholdToFumigate: 0.5,
      rationale: "Focalizar contención en Tarqui y ULEAM en fase inicial",
    };

    expect(AIPolicySpecSchema.safeParse(validPolicy).success).toBe(true);
  });

  it("rejects policy when sum of ratios exceeds 1.0", () => {
    const invalidPolicy = {
      version: "1.0.0",
      budgetAllocation: {
        vaccineRatio: 0.5,
        fumigationRatio: 0.4,
        cordonRatio: 0.2, // Sum = 1.1 > 1.0
      },
      nodePriorityRule: "HIGHEST_INFECTED_FIRST",
      minSusceptibleToVaccinate: 50,
      vectorThresholdToFumigate: 0.4,
      rationale: "Excede presupuesto",
    };

    expect(AIPolicySpecSchema.safeParse(invalidPolicy).success).toBe(false);
  });

  it("rejects policy with negative ratios or executable code", () => {
    const maliciousPolicy = {
      version: "1.0.0",
      budgetAllocation: {
        vaccineRatio: -0.1,
        fumigationRatio: 0.5,
        cordonRatio: 0.5,
      },
      nodePriorityRule: "eval('process.exit(1)')",
      minSusceptibleToVaccinate: 50,
      vectorThresholdToFumigate: 0.4,
      rationale: "Inyección maliciosa",
    };

    expect(AIPolicySpecSchema.safeParse(maliciousPolicy).success).toBe(false);
  });
});
