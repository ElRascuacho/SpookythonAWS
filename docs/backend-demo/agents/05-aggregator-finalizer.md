# Task Brief 05: Results Aggregator, Percentiles Calculation and Finalizer

## Meta Information
* **Task Identifier:** `task_agent_05_aggregator`
* **Target Package:** `docs/backend-demo/agents/05-aggregator-finalizer.md`
* **Ownership Boundary:** Aggregation Lambda function, mathematical percentile calculation (P10/Mean/P90), representative trajectory extraction, final S3 result persistence, and DynamoDB job state finalization.
* **Skills Required:**
  * `C:/Users/MSI BRAVO/.gemini/antigravity-cli/skills/cognitive-doc-design/SKILL.md`
  * `C:/Users/MSI BRAVO/.codex/plugins/cache/openai-curated-remote/app-6a0b1644959c8191a6ecd016190651cd/1.0.0/skills/aws-serverless/SKILL.md`
* **Mandatory Pre-read:**
  * [`src/domain/monteCarlo.ts`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/src/domain/monteCarlo.ts#L80-L160)
  * [`docs/backend-demo/design.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/design.md) (Sections 3 & 4)

---

## 1. Objective and Scope
Implement the aggregator Lambda function that is triggered at the conclusion of the Step Functions Inline Map. It validates the complete manifest of 20 batches per strategy (500 runs each), sorts runs by global `runIndex`, calculates statistical bands (P10, Mean, P90) across all 60 days without averaging percentiles, extracts the representative trajectory `run0`, writes the final consolidated JSON to private S3, and marks the job as `COMPLETED` in DynamoDB while releasing the invitation's active concurrency slot.

---

## 2. Changes to Apply
1. **Mathematical Percentile Aggregator (`backend/math/percentileAggregator.ts`):**
   * Preserves exact original logic: sorts 500 values per day, calculates 10th percentile and 90th percentile with linear interpolation, computes mean and standard deviation, and rounds integers where applicable.
   * Never averages pre-calculated percentiles across batches.
2. **Aggregator Handler (`backend/workers/aggregator.ts`):**
   * Input payload: `{ jobId, strategies, runsPerStrategy, s3ResultsBucket }`.
   * Manifest validation: checks that all expected S3 batch objects exist (`jobs/<jobId>/batches/<strategy>_<0..19>.json.gz`).
   * If any batch is missing or corrupted, fails the job cleanly with error code `INCOMPLETE_BATCH_MANIFEST`.
   * Assembles final comparison envelope (compatible with frontend expectation):
     * Daily timeline bands: `[P10, Mean, P90]` for Susceptible, Exposed, Infected, Recovered, Hospitalized.
     * Summary metrics: `finalInfected`, `peakInfected`, `livesSavedVsBase` (clamped to 0 if negative).
     * `representativeTrajectories`: full node state timeline for `runIndex === 0` per strategy.
   * Uploads final consolidated JSON to `jobs/<jobId>/results.json`.
   * Updates DynamoDB item:
     * `status = 'COMPLETED'`
     * `s3ResultsKey = 'jobs/<jobId>/results.json'`
     * `completedAt = ISO_TIMESTAMP`
   * Calls slot release: decrements `activeJobsCount` on `INV#<invitationId>`.

---

## 3. Strict Constraints
* **No Premature Finalization:** Never mark `COMPLETED` if even one batch file is missing.
* **Preserve Clamping Invariant:** `livesSavedVsBase` must remain clamped to `>= 0` as established in the domain engine.
* **TDD Requirement:** Write `backend/__tests__/aggregator.test.ts` first, verifying exact numerical parity against a single-process 500-run simulation, and verifying failure handling on simulated missing batches.

---

## 4. Affected Paths
* `backend/math/percentileAggregator.ts` (new)
* `backend/workers/aggregator.ts` (new)
* `backend/__tests__/aggregator.test.ts` (new test suite)

---

## 5. Acceptance Criteria and Verification
1. `bun test backend/__tests__/aggregator.test.ts` passes 100%.
2. Final JSON output matches the schema expected by `GET /api/v1/jobs/{id}/results`.
3. Execution time for aggregating 1.500 runs is `< 3.5 seconds` on ARM64.
4. DynamoDB atomic update transitions status to `COMPLETED` and decrements `activeJobsCount` exactly once.
