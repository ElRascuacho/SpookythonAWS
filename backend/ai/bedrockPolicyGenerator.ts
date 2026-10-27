import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { AIPolicySpec, AIPolicySpecSchema } from "../../src/domain/schemas/aiPolicy.schema";
import { SimulationParams } from "../../src/domain/types";
import { formatPolicyPrompt } from "./promptTemplates";
import { InMemoryDatabase } from "../storage/inMemoryDatabase";
import { hashSecret } from "../auth/crypto";

export const BEDROCK_MODEL_ID = "amazon.nova-micro-v1:0";

export const DEFAULT_FALLBACK_POLICY: AIPolicySpec = {
  version: "1.0.0",
  budgetAllocation: {
    vaccineRatio: 0.5,
    fumigationRatio: 0.25,
    cordonRatio: 0.25,
  },
  nodePriorityRule: "HIGHEST_INFECTED_FIRST",
  minSusceptibleToVaccinate: 50,
  vectorThresholdToFumigate: 0.3,
  rationale: "Fallback determinista de contención Smart Graph Cortafuegos.",
};

export interface BedrockPolicyInput {
  jobId: string;
  params: SimulationParams;
}

export interface BedrockPolicyDependencies {
  db: InMemoryDatabase;
  bedrockClient?: BedrockRuntimeClient | { send: (cmd: any) => Promise<any> };
}

export interface BedrockPolicyOutput {
  policySpec: AIPolicySpec;
  aiProvenance: {
    status: "AI_GENERATED" | "CACHED" | "FALLBACK_DETERMINISTIC";
    modelId: string;
    reason?: string;
    cachedAt?: string;
  };
}

export async function generateBedrockPolicy(
  input: BedrockPolicyInput,
  deps: BedrockPolicyDependencies,
): Promise<BedrockPolicyOutput> {
  const { jobId, params } = input;

  // 1. Check deterministic cache in DynamoDB
  const cacheKey = hashSecret(
    JSON.stringify({
      model: BEDROCK_MODEL_ID,
      patientZeroIds: params.patientZeroIds,
      dailyBudget: params.dailyBudget,
      vaccineCost: params.vaccineCost,
      fumigationCost: params.fumigationCost,
      cordonCost: params.cordonCost,
    }),
  );

  const cachedItem = await deps.db.getItem(`AIPOLICY#${cacheKey}`, "ARTIFACT");
  if (cachedItem && cachedItem.policySpec) {
    return {
      policySpec: cachedItem.policySpec,
      aiProvenance: {
        status: "CACHED",
        modelId: BEDROCK_MODEL_ID,
        cachedAt: cachedItem.createdAt,
      },
    };
  }

  // 2. Check if Bedrock is explicitly disabled in environment
  if (process.env.ENABLE_BEDROCK_AI === "false") {
    return {
      policySpec: DEFAULT_FALLBACK_POLICY,
      aiProvenance: {
        status: "FALLBACK_DETERMINISTIC",
        modelId: BEDROCK_MODEL_ID,
        reason: "BEDROCK_DISABLED_BY_CONFIG",
      },
    };
  }

  // 3. Prepare client and command
  const client =
    deps.bedrockClient ||
    new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

  const prompt = formatPolicyPrompt({
    patientZeroIds: params.patientZeroIds,
    dailyBudget: params.dailyBudget,
    vaccineCost: params.vaccineCost,
    fumigationCost: params.fumigationCost,
    cordonCost: params.cordonCost,
  });

  try {
    // Record reservation attempt in DynamoDB (max 2 attempts per job)
    await deps.db.putItem({
      PK: `JOB#${jobId}`,
      SK: "AI_ATTEMPT#1",
      status: "INVOKED",
      reservedAt: new Date().toISOString(),
    });

    const command = new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      messages: [
        {
          role: "user",
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: 1024,
        temperature: 0.0,
      },
    });

    // Execute with 15s timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Bedrock request timed out after 15s")), 15000),
    );

    const response: any = await Promise.race([client.send(command), timeoutPromise]);
    const responseText =
      response?.output?.message?.content?.[0]?.text || "";

    // Parse and validate JSON output
    let parsedJson: any;
    try {
      // Clean markdown code blocks if any
      const cleaned = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsedJson = JSON.parse(cleaned);
    } catch {
      return {
        policySpec: DEFAULT_FALLBACK_POLICY,
        aiProvenance: {
          status: "FALLBACK_DETERMINISTIC",
          modelId: BEDROCK_MODEL_ID,
          reason: "INVALID_JSON_RESPONSE",
        },
      };
    }

    const validation = AIPolicySpecSchema.safeParse(parsedJson);
    if (!validation.success) {
      return {
        policySpec: DEFAULT_FALLBACK_POLICY,
        aiProvenance: {
          status: "FALLBACK_DETERMINISTIC",
          modelId: BEDROCK_MODEL_ID,
          reason: `SCHEMA_VALIDATION_FAILED: ${validation.error.message}`,
        },
      };
    }

    const policySpec = validation.data;

    // Cache valid policy in DynamoDB
    const now = new Date().toISOString();
    await deps.db.putItem({
      PK: `AIPOLICY#${cacheKey}`,
      SK: "ARTIFACT",
      cacheKey,
      policySpec,
      modelId: BEDROCK_MODEL_ID,
      createdAt: now,
      ttl: Math.floor(Date.now() / 1000) + 7 * 86400,
    });

    return {
      policySpec,
      aiProvenance: {
        status: "AI_GENERATED",
        modelId: BEDROCK_MODEL_ID,
      },
    };
  } catch (err: any) {
    const errorName = err?.name || "Error";
    const errorMessage = err?.message || String(err);

    return {
      policySpec: DEFAULT_FALLBACK_POLICY,
      aiProvenance: {
        status: "FALLBACK_DETERMINISTIC",
        modelId: BEDROCK_MODEL_ID,
        reason: `${errorName}: ${errorMessage}`,
      },
    };
  }
}
