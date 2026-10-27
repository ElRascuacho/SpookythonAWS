import { describe, expect, it, beforeEach } from "bun:test";
import { formatPolicyPrompt } from "../ai/promptTemplates";
import { interpretAiPolicyDailyAction } from "../ai/policyInterpreter";
import {
  generateBedrockPolicy,
  BedrockPolicyInput,
} from "../ai/bedrockPolicyGenerator";
import { DEFAULT_SIMULATION_PARAMS, MANTA_NODES } from "../../src/domain/mantaGraph";
import { InMemoryDatabase } from "../storage/inMemoryDatabase";
import { AIPolicySpec } from "../../src/domain/schemas/aiPolicy.schema";

describe("Task 08: AI Policy Prompt & Interpretation", () => {
  it("formats prompt strictly under 8 KB with clear JSON contract", () => {
    const prompt = formatPolicyPrompt({
      patientZeroIds: ["N01"],
      dailyBudget: 1000,
      vaccineCost: 200,
      fumigationCost: 250,
      cordonCost: 300,
    });

    expect(prompt.length).toBeLessThan(8192);
    expect(prompt).toContain("AIPolicySpec");
    expect(prompt).toContain("vaccineRatio");
    expect(prompt).toContain("fumigationRatio");
    expect(prompt).toContain("cordonRatio");
    expect(prompt).toContain("N01");
  });

  it("interprets declarative policy into daily actions without exceeding budget", () => {
    const policy: AIPolicySpec = {
      version: "1.0.0",
      budgetAllocation: {
        vaccineRatio: 0.4, // $400 / $200 = 2 batches
        fumigationRatio: 0.3, // $300 / $250 = 1 node
        cordonRatio: 0.3, // $300 / $300 = 1 cordon
      },
      nodePriorityRule: "HIGHEST_INFECTED_FIRST",
      minSusceptibleToVaccinate: 50,
      vectorThresholdToFumigate: 0.3,
    };

    // Mock city state at Day 1
    const nodeStates = Object.fromEntries(
      MANTA_NODES.map((n) => [
        n.id,
        {
          S: n.id === "N01" ? 17000 : n.population,
          E: n.id === "N01" ? 50 : 0,
          I: n.id === "N01" ? 35 : 0,
          R: 0,
          vectorIndex: n.baseVectorRisk,
        },
      ]),
    );

    const action = interpretAiPolicyDailyAction({
      day: 1,
      policy,
      nodeStates,
      params: DEFAULT_SIMULATION_PARAMS,
    });

    expect(action.budgetSpent).toBeLessThanOrEqual(DEFAULT_SIMULATION_PARAMS.dailyBudget);
    expect(action.day).toBe(1);
    expect(action.summaryText).toBeDefined();
    // Vaccines must only be administered to nodes with susceptible population
    for (const [nodeId, doses] of Object.entries(action.vaccinatedNodes)) {
      expect(doses).toBeGreaterThan(0);
      expect(nodeStates[nodeId].S).toBeGreaterThan(0);
    }
  });
});

describe("Task 08: Bedrock Policy Generator & Graceful Fallback", () => {
  let db: InMemoryDatabase;

  beforeEach(() => {
    db = new InMemoryDatabase();
  });

  it("gracefully falls back to SMART_CORTAFUEGOS on simulated Bedrock throttling", async () => {
    // Mock Bedrock client throwing ThrottlingException
    const mockBedrockClient = {
      send: async () => {
        const error: any = new Error("Too Many Requests");
        error.name = "ThrottlingException";
        throw error;
      },
    };

    const input: BedrockPolicyInput = {
      jobId: "019488a0-711e-7f61-b68e-9cb2657e4e11",
      params: DEFAULT_SIMULATION_PARAMS,
    };

    const result = await generateBedrockPolicy(input, {
      db,
      bedrockClient: mockBedrockClient as any,
    });

    expect(result.policySpec).toBeDefined();
    expect(result.aiProvenance.status).toBe("FALLBACK_DETERMINISTIC");
    expect(result.aiProvenance.reason).toContain("ThrottlingException");
  });

  it("gracefully falls back on Bedrock timeout or malformed non-JSON output", async () => {
    const mockBedrockClient = {
      send: async () => {
        return {
          output: {
            message: {
              content: [{ text: "No soy capaz de devolver JSON ahora mismo." }],
            },
          },
        };
      },
    };

    const input: BedrockPolicyInput = {
      jobId: "job-malformed-json",
      params: DEFAULT_SIMULATION_PARAMS,
    };

    const result = await generateBedrockPolicy(input, {
      db,
      bedrockClient: mockBedrockClient as any,
    });

    expect(result.policySpec).toBeDefined();
    expect(result.aiProvenance.status).toBe("FALLBACK_DETERMINISTIC");
    expect(result.aiProvenance.reason).toContain("INVALID_JSON");
  });

  it("uses cached policy without calling Bedrock on second identical request", async () => {
    let callCount = 0;
    const mockBedrockClient = {
      send: async () => {
        callCount++;
        return {
          output: {
            message: {
              content: [
                {
                  text: JSON.stringify({
                    version: "1.0.0",
                    budgetAllocation: {
                      vaccineRatio: 0.5,
                      fumigationRatio: 0.25,
                      cordonRatio: 0.25,
                    },
                    nodePriorityRule: "HIGHEST_INFECTED_FIRST",
                    minSusceptibleToVaccinate: 60,
                    vectorThresholdToFumigate: 0.35,
                    rationale: "Focalizar contención inicial",
                  }),
                },
              ],
            },
          },
        };
      },
    };

    const input: BedrockPolicyInput = {
      jobId: "job-cached-1",
      params: DEFAULT_SIMULATION_PARAMS,
    };

    const first = await generateBedrockPolicy(input, {
      db,
      bedrockClient: mockBedrockClient as any,
    });
    expect(first.aiProvenance.status).toBe("AI_GENERATED");
    expect(callCount).toBe(1);

    // Second request with same params
    const second = await generateBedrockPolicy(
      { jobId: "job-cached-2", params: DEFAULT_SIMULATION_PARAMS },
      { db, bedrockClient: mockBedrockClient as any },
    );
    expect(second.aiProvenance.status).toBe("CACHED");
    expect(callCount).toBe(1); // Bedrock was NOT invoked a second time
  });
});
