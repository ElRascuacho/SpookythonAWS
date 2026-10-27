# Task Brief 04: Headless Monte Carlo Batch Worker and S3 Storage

## Meta Information
* **Task Identifier:** `task_agent_04_batch_worker`
* **Target Package:** `docs/backend-demo/agents/04-batch-worker.md`
* **Ownership Boundary:** Headless simulation worker Lambda, batch partitioning (25 runs), Node.js 22 ARM64 optimization, and S3 batch file storage.
* **Skills Required:**
  * `C:/Users/MSI BRAVO/.gemini/antigravity-cli/skills/cognitive-doc-design/SKILL.md`
  * `C:/Users/MSI BRAVO/.codex/plugins/cache/openai-curated-remote/app-6a0b1644959c8191a6ecd016190651cd/1.0.0/skills/aws-serverless/SKILL.md`
* **Mandatory Pre-read:**
  * [`src/domain/seirEngine.ts`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/src/domain/seirEngine.ts#L20-L75)
  * [`src/domain/monteCarlo.ts`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/src/domain/monteCarlo.ts)
  * [`docs/backend-demo/design.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/design.md) (Section 3)

---

## 1. Objective and Scope
Implement the discrete batch worker Lambda function in Node.js 22 (ARM64) that executes 25 Monte Carlo runs per invocation for a specific strategy, preserving the mathematical PRNG seeding and strategy-salting logic of the original engine. Persist the compressed batch output directly to a private Amazon S3 bucket and register an idempotent conditional receipt in DynamoDB.

---

## 2. Changes to Apply
1. **Batch Execution Handler (`backend/workers/batchWorker.ts`):**
   * Input payload:
     ```json
     {
       "jobId": "uuid",
       "attempt": 1,
       "strategy": "NO_INTERVENTION" | "RANDOM" | "SMART_CORTAFUEGOS" | "AI_CORTAFUEGOS",
       "batchIndex": 0,
       "startRunIndex": 0,
       "runsCount": 25,
       "params": { ... },
       "aiPolicySpec": null | { ... }
     }
     ```
   * Loops through `runIndex = startRunIndex` to `startRunIndex + runsCount - 1`.
   * Preserves exact PRNG derivation: `hashSeed(params.seed, scenarioHash, runIndex)` and strategy salting `strategyRng = params.seed ^ 0x13579bdf`.
   * Keeps `run0` full daily timeline when `startRunIndex === 0`.
   * For other runs, keeps daily scalar summaries (total Susceptible, Exposed, Infected, Recovered, Vaccinated) to minimize memory and payload.
2. **S3 Storage Client (`backend/storage/s3Client.ts`):**
   * Writes JSON payload to immutable attempt-indexed path:
     `jobs/<jobId>/attempts/<attempt>/batches/<strategy>_<batchIndex>.json.gz`.
   * Sets metadata: `x-amz-meta-job-id`, `x-amz-meta-attempt`, `x-amz-meta-strategy`, `x-amz-meta-batch-index`.
3. **Idempotent Batch Receipt in DynamoDB with Attempt Fencing:**
   * Conditional `PutItem` to `PK = JOB#<jobId>`, `SK = ATTEMPT#<attempt>#BATCH#<strategy>#<batchIndex>` with condition `attribute_not_exists(PK)`. Fences out delayed workers from older attempts and prevents duplicate counting on Step Functions retries.

---

## 3. Strict Constraints
* **Bit-Identical Mathematical Parity:** The calculations for any `runIndex` in the batch worker must match the original `monteCarlo.ts` result bit-by-bit when given the same seed and parameters.
* **No Memory Exhaustion:** Do NOT keep full node-by-node timelines for all 25 runs; keep full node snapshots only for `runIndex === 0`.
* **TDD Requirement:** Write `backend/__tests__/batchWorker.test.ts` first, asserting that batch-executed runs match monolithic runs for the same seed, and verifying conditional DynamoDB writes.

---

## 4. Affected Paths
* `backend/workers/batchWorker.ts` (new)
* `backend/storage/s3Client.ts` (new)
* `backend/__tests__/batchWorker.test.ts` (new test suite)

---

## 5. Acceptance Criteria and Verification
1. `bun test backend/__tests__/batchWorker.test.ts` passes 100%.
2. Batch of 25 runs completes in `< 2.5 seconds` on ARM64 Graviton / local Bun.
3. S3 batch JSON file is created and compressed; DynamoDB receipt is recorded.
4. Retry of same batch payload results in idempotent success without duplicate processing.
