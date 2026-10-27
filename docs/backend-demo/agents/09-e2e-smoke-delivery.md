# Task Brief 09: End-to-End Testing Suite, Privacy Verification and Pitch Smoke

## Meta Information
* **Task Identifier:** `task_agent_09_e2e_smoke`
* **Target Package:** `docs/backend-demo/agents/09-e2e-smoke-delivery.md`
* **Ownership Boundary:** E2E integration test suite, two-invitation isolation verification, pitch smoke script, and package sanity verification in Node.js 22 runtime.
* **Skills Required:**
  * `C:/Users/MSI BRAVO/.gemini/antigravity-cli/skills/cognitive-doc-design/SKILL.md`
  * `C:/Users/MSI BRAVO/.codex/plugins/cache/openai-curated-remote/app-6a0b1644959c8191a6ecd016190651cd/1.0.0/skills/aws-serverless/SKILL.md`
* **Mandatory Pre-read:**
  * [`docs/backend-demo/design.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/design.md)
  * [`docs/backend-demo/deploy-and-orca.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/deploy-and-orca.md)

---

## 1. Objective and Scope
Implement the final integration and verification layer that validates the entire backend pipeline end-to-end. This includes verifying isolation between two independent invitations, verifying visibility toggling to `SHARED_INVITEES`, ensuring that bundled Lambda handlers run cleanly in native Node.js 22 (outside of Bun/Vite), and providing an automated smoke-test script for post-deployment verification.

---

## 2. Changes to Apply
1. **Two-Invitation Isolation Test (`tests/e2e/twoInvitationsFlow.test.ts`):**
   * Creates Invitation 1 and Invitation 2.
   * Session 1 creates a private job (`visibility: 'PRIVATE'`).
   * Session 2 queries `GET /api/v1/jobs/{jobId-1}` and expects `404 Not Found`.
   * Session 1 patches visibility to `'SHARED_INVITEES'`.
   * Session 2 queries again and now receives `200 OK` with full results.
   * Session 1 attempts to create a second concurrent job while the first is running; expects `409 Conflict` (enforcing max 1 active job per invitation).
2. **Node.js 22 Packaging Smoke Test (`scripts/node-smoke-check.mjs`):**
   * Uses native `node` runtime to load and execute the built esbuild bundle in `.aws-sam/build/`.
   * Verifies that all AWS SDK v3 modular imports resolve without missing peer dependencies or Bun-specific APIs.
3. **Automated Smoke Test Script (`scripts/smoke-test.sh`):**
   * Bash/PowerShell script that sends requests against the live API Gateway endpoint:
     1. Authenticates session.
     2. Posts simulation job.
     3. Polls status every 3 seconds until `COMPLETED`.
     4. Fetches and validates results schema.
     5. Emits total duration (must be `< 45 seconds`).

---

## 3. Strict Constraints
* **No Test-Only Compromises:** All E2E tests must execute against real or high-fidelity local HTTP/DynamoDB endpoints, validating actual cookies and headers.
* **No UI Breakage:** Ensure the JSON output schema matches the expectations of the existing frontend visual components.
* **TDD Requirement:** Run tests against clean local environment and confirm each failure mode before passing.

---

## 4. Affected Paths
* `tests/e2e/twoInvitationsFlow.test.ts` (new)
* `scripts/node-smoke-check.mjs` (new)
* `scripts/smoke-test.sh` (new)

---

## 5. Acceptance Criteria and Verification
1. `bun test tests/e2e/twoInvitationsFlow.test.ts` passes 100%.
2. `node scripts/node-smoke-check.mjs` exits with code 0 on the SAM-built bundle.
3. Smoke test against local SAM or deployed AWS stack completes in `< 45 seconds` with valid P10/P90 bands.
4. Total demo run proves that 1,500 Monte Carlo runs execute reliably without timeouts or cost spikes.
