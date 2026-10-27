# Task Brief 08: Optional AI Policy Generator with Amazon Bedrock

## Meta Information
* **Task Identifier:** `task_agent_08_bedrock`
* **Target Package:** `docs/backend-demo/agents/08-ai-policy-bedrock.md`
* **Ownership Boundary:** Bedrock Nova Micro client, Converse API integration, strict JSON policy schema validation, deterministic caching, and graceful fallback adapter.
* **Skills Required:**
  * `C:/Users/MSI BRAVO/.gemini/antigravity-cli/skills/cognitive-doc-design/SKILL.md`
  * `C:/Users/MSI BRAVO/.codex/plugins/cache/openai-curated-remote/app-6a0b1644959c8191a6ecd016190651cd/1.0.0/skills/amazon-bedrock/SKILL.md`
  * `C:/Users/MSI BRAVO/.codex/plugins/cache/openai-curated-remote/app-6a0b1644959c8191a6ecd016190651cd/1.0.0/skills/aws-serverless/SKILL.md`
* **Mandatory Pre-read:**
  * [`docs/backend-demo/design.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/design.md) (Section 5)
  * [`src/domain/strategies.ts`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/src/domain/strategies.ts#L100-L280)

---

## 1. Objective and Scope
Implement the optional AI intervention policy generator using Amazon Bedrock Nova Micro (`amazon.nova-micro-v1:0`) via the Converse API in `us-east-1`. The AI generates a bounded declarative policy once per job, which is then interpreted deterministically by the numerical engine during each day of the simulation. If Bedrock is unavailable, throttled, or returns malformed JSON, automatically execute a graceful fallback to `SMART_CORTAFUEGOS` with clear provenance labeling, preventing user-facing simulation failure.

---

## 2. Changes to Apply
1. **Bedrock Policy Generator Client (`backend/ai/bedrockPolicyGenerator.ts`):**
   * Uses `@aws-sdk/client-bedrock-runtime` (`ConverseCommand`).
   * Sets strict call parameters:
     * `modelId`: `amazon.nova-micro-v1:0`
     * `maxTokens`: 1024 (mandatory explicit setting to avoid quota reservation issues)
     * `temperature`: 0.0
   * Timeout: 15 seconds per call; maximum total budget of 2 attempts per job (1 network retry or 1 JSON schema repair attempt).
   * Checks deterministic cache in DynamoDB (`AIPOLICY#<cacheKey>`) before calling Bedrock.
2. **Prompt Template and JSON Extractor (`backend/ai/promptTemplates.ts`):**
   * Formats urban topology, initial infected nodes, and budget parameters into a concise prompt (`< 8 KB`).
   * Explicitly instructs the model to return valid JSON matching `AIPolicySpec`.
3. **Policy Interpreter Adapter (`backend/ai/policyInterpreter.ts`):**
   * Converts `AIPolicySpec` into daily intervention decisions (vaccination batches, cordons, and fumigations) within `src/domain/strategies.ts` under strategy key `AI_CORTAFUEGOS`.
   * Enforces that daily total cost cannot exceed `dailyBudget` ($1,000 USD).
4. **Graceful Fallback Mechanism:**
   * In case of any Bedrock error (`ThrottlingException`, `AccessDeniedException`, schema invalidation, or timeout), catches error, logs incident, adopts `SMART_CORTAFUEGOS` parameters, and sets `aiProvenance: { status: 'FALLBACK_DETERMINISTIC', reason: '<error_code>' }`.

---

## 3. Strict Constraints
* **No Code Execution / No Eval:** The LLM delivers only bounded numbers and weights in a JSON object; never execute arbitrary code from the model.
* **No LLM in Monte Carlo Loop:** Exactly one Bedrock invocation per simulation job; zero LLMs during individual runs or days.
* **No Unlabeled Fallbacks:** Never falsely claim that AI computed the strategy if fallback was triggered.
* **TDD Requirement:** Write `backend/__tests__/aiPolicy.test.ts` first, asserting JSON schema validation, cache hits, and deterministic fallback on simulated Bedrock timeouts or throttling.

---

## 4. Affected Paths
* `backend/ai/bedrockPolicyGenerator.ts` (new)
* `backend/ai/promptTemplates.ts` (new)
* `backend/ai/policyInterpreter.ts` (new)
* `backend/__tests__/aiPolicy.test.ts` (new test suite)

---

## 5. Acceptance Criteria and Verification
1. `bun test backend/__tests__/aiPolicy.test.ts` passes 100%.
2. Simulated Bedrock throttling gracefully falls back to `SMART_CORTAFUEGOS` with `aiProvenance.status === 'FALLBACK_DETERMINISTIC'`.
3. Valid Bedrock response produces an `AIPolicySpec` that runs in the Monte Carlo engine without budget violations.
4. If `ENABLE_BEDROCK_AI=false` in environment, generator skips Bedrock and immediately returns base baseline.
