# Task Brief 01: Contracts, Schemas, Legacy Migration and OpenAPI Derivation

## Meta Information
* **Task Identifier:** `task_agent_01_contracts`
* **Target Package:** `docs/backend-demo/agents/01-contracts.md`
* **Ownership Boundary:** Domain schemas, Zod validation models, legacy route retirement, and OpenAPI derivation scripts. Excludes UI components (`src/App.tsx`, visual components).
* **Skills Required:**
  * `C:/Users/MSI BRAVO/.gemini/antigravity-cli/skills/cognitive-doc-design/SKILL.md`
  * `C:/Users/MSI BRAVO/.codex/plugins/cache/openai-curated-remote/app-6a0b1644959c8191a6ecd016190651cd/1.0.0/skills/aws-serverless/SKILL.md`
* **Mandatory Pre-read:**
  * [`docs/backend-demo/design.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/design.md)
  * [`src/domain/types.ts`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/src/domain/types.ts)
  * [`backend/handler.ts`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/backend/handler.ts)

---

## 1. Objective and Scope
Implement strict runtime validation schemas using Zod for all simulation inputs, session authentication, job state envelopes, and AI declarative policy specifications. Deprecate legacy endpoints (`/simulate`, `/mayor-report`) to prevent unauthenticated compute bypass, and create an automated generator that derives the canonical OpenAPI 3.1 specification directly from the code types.

---

## 2. Changes to Apply
1. **Zod Validation Schemas (`src/domain/schemas/`):**
   * `simulationParams.schema.ts`: Define `SimulationParamsSchema` enforcing numeric bounds across all 17 fields of `SimulationParams`:
     * `betaHuman`, `betaVector`: float in `[0.01, 1.0]` (defaults: 0.35, 0.12).
     * `sigma`, `gamma`: float in `[0.01, 1.0]` (defaults: 0.33, 0.10).
     * `hospitalCapacity`: integer in `[100, 10000]` (default: 2500, municipal contingency saturation threshold).
     * `vaccineEfficacy`: float in `[0.10, 1.0]` (default: 0.85).
     * `dailyBudget`: integer in `[100, 10000]` (default: 1000).
     * `vaccineCost`: integer in `[1, 5000]` (default: 200).
     * `vaccineBatchSize`: integer in `[10, 5000]` (default: 500).
     * `fumigationCost`: integer in `[1, 5000]` (default: 250).
     * `cordonCost`: integer in `[1, 5000]` (default: 300).
     * `days`: integer in `[1, 60]` (default: 60).
     * `seed`: unsigned 32-bit integer `[1, 4294967295]` (default: 20261030).
     * `monteCarloRuns`: integer in `[10, 500]` (default: 500 in server profile).
     * `patientZeroIds`: non-empty array of valid node identifiers (`N01`..`N16`).
     * `initialInfectedPerNode`: integer in `[1, 500]` (default: 35).
     * `initialExposedPerNode`: integer in `[0, 500]` (default: 50).
   * `api.schema.ts`: Define request/response contracts for:
     * `CreateSessionRequestSchema`: `code` with high cryptographic entropy (>=128 bits, regex `^[A-Z2-7]{4}(-[A-Z2-7]{4}){5,7}$` or 32..64 hex).
     * `CreateJobRequestSchema`: `params` (17 fields), `enableAiStrategy` (boolean), `visibility` (`'PRIVATE' | 'SHARED_INVITEES'`), and header `Idempotency-Key` (string 1..128 chars).
     * `JobListResponseSchema`, `JobStatusResponseSchema`, `JobResultsResponseSchema` (v2 versioned envelope preserving exact `MonteCarloComparisonResult` shape plus optional `aiSummary`), and uniform `ApiErrorResponseSchema`.
   * `aiPolicy.schema.ts`: Define `AIPolicySpecSchema` with normalized weights (`vaccineRatio + fumigationRatio + cordonRatio <= 1.0`), triggers on current state (S, E, I, R, vector, dailyBudget), deterministic node tie-breaks, and strict `no-eval` rules.
2. **Legacy Route Migration Guard:**
   * Modify `backend/handler.ts` or add legacy route guard to ensure `/simulate` and `/mayor-report` return `410 Gone` or require the exact same session authentication and rate limiting as `/api/v1/jobs`. No unauthenticated compute path allowed.
3. **OpenAPI Generator Script (`scripts/generate-openapi.ts` - Planned):**
   * Script executable via `bun run scripts/generate-openapi.ts` to output `docs/contracts/openapi.yaml`.

---

## 3. Strict Constraints
* **No UI Changes:** Do NOT modify `src/App.tsx`, CSS files, or 3D rendering views.
* **No Unauthenticated Compute:** The legacy endpoints must be neutralized.
* **TDD Requirement:** Write failing tests first in `src/domain/__tests__/schemas.test.ts` demonstrating boundary violations (negative numbers, NaN, SQL/XSS injections, out-of-range days) before implementing schema code.

---

## 4. Affected Paths
* `src/domain/schemas/simulationParams.schema.ts` (new)
* `src/domain/schemas/api.schema.ts` (new)
* `src/domain/schemas/aiPolicy.schema.ts` (new)
* `src/domain/__tests__/schemas.test.ts` (new test suite)
* `scripts/generate-openapi.ts` (new script)
* `docs/contracts/openapi.yaml` (generated artifact)
* `backend/handler.ts` (legacy route update)

---

## 5. Acceptance Criteria and Verification
1. `bun test src/domain/__tests__/schemas.test.ts` executes and passes 100% of cases.
2. Legacy endpoints reject unauthenticated compute with `401 Unauthorized` or `410 Gone`.
3. `bun run scripts/generate-openapi.ts` outputs valid OpenAPI 3.1 YAML without runtime errors.
4. Existing baseline tests (`bun test src/domain/__tests__/simulation.test.ts`) continue to pass (4 pass, 0 fail).
