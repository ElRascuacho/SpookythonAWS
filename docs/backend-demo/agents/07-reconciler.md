# Task Brief 07: Scheduled Reconciler and Job Recovery

## Meta Information
* **Task Identifier:** `task_agent_07_reconciler`
* **Target Package:** `docs/backend-demo/agents/07-reconciler.md`
* **Ownership Boundary:** EventBridge scheduled reconciler Lambda function, stale job detection, Step Functions execution status synchronization, and atomic quota/slot recovery.
* **Skills Required:**
  * `C:/Users/MSI BRAVO/.gemini/antigravity-cli/skills/cognitive-doc-design/SKILL.md`
  * `C:/Users/MSI BRAVO/.codex/plugins/cache/openai-curated-remote/app-6a0b1644959c8191a6ecd016190651cd/1.0.0/skills/aws-serverless/SKILL.md`
* **Mandatory Pre-read:**
  * [`docs/backend-demo/design.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/design.md) (Sections 2 & 3)

---

## 1. Objective and Scope
Implement a resilient recovery worker triggered on a schedule (every 5 minutes via EventBridge) to detect and resolve zombie or orphaned simulation jobs. If a job has been in `PENDING` or `RUNNING` for over 15 minutes (exceeding workflow timeout limits), the reconciler checks the underlying Step Functions execution via `DescribeExecution`, updates DynamoDB to `TIMED_OUT` or `FAILED`, and releases the user's active concurrency slot (`activeJobsCount`) exactly once.

---

## 2. Changes to Apply
1. **Reconciler Handler (`backend/reconciliation/reconciler.ts`):**
   * Triggered by `ScheduledEvent` every 5 minutes.
   * Queries DynamoDB using `GSI1` for jobs where `status IN ('PENDING', 'RUNNING')` and `createdAt < NOW() - 15 minutes`.
2. **Reconciliation and Recovery Logic (`backend/reconciliation/cleanupService.ts`):**
   * For each orphaned job:
     * If `stepFunctionExecutionArn` exists, calls `DescribeExecution`.
     * If execution is `TIMED_OUT`, `FAILED`, or `ABORTED`, mirrors that status to DynamoDB.
     * If execution does not exist (crash occurred before `StartExecution`), marks job as `FAILED` with error `STARTUP_TIMEOUT`.
     * Atomically updates DynamoDB item:
       * `status = 'TIMED_OUT' | 'FAILED'`
       * `closedBy = 'RECONCILER'`
       * `closedAt = ISO_TIMESTAMP`
     * Decrements `activeJobsCount` on `INV#<invitationId>` with condition `activeJobsCount > 0` to prevent negative counts.
3. **EventBridge Rule in SAM (`infra/template.yaml`):**
   * EventBridge schedule: `rate(5 minutes)`.
   * Targets `ReconcilerFunction`.

---

## 3. Strict Constraints
* **No Double Release:** Ensure that the quota/active-slot decrement is executed conditionally and exactly once.
* **No Premature Cancellation:** Never interrupt jobs that are actively running within their normal 15-minute window.
* **TDD Requirement:** Write `backend/__tests__/reconciler.test.ts` first, mocking DynamoDB and Step Functions, and asserting that stuck jobs are reclaimed and slots freed cleanly.

---

## 4. Affected Paths
* `backend/reconciliation/reconciler.ts` (new)
* `backend/reconciliation/cleanupService.ts` (new)
* `backend/__tests__/reconciler.test.ts` (new test suite)
* `infra/template.yaml` (includes reconciler schedule)

---

## 5. Acceptance Criteria and Verification
1. `bun test backend/__tests__/reconciler.test.ts` passes 100%.
2. Stale jobs (> 15 min old) are transitioned to `TIMED_OUT`.
3. Invitation `activeJobsCount` is decremented back to 0, allowing the user to submit new jobs.
4. Jobs within the 15-minute threshold are left untouched.
