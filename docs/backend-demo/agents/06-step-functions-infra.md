# Task Brief 06: Step Functions Workflow, SAM Infrastructure and API Handler

## Meta Information
* **Task Identifier:** `task_agent_06_infra`
* **Target Package:** `docs/backend-demo/agents/06-step-functions-infra.md`
* **Ownership Boundary:** AWS SAM template (`infra/template.yaml`), Step Functions ASL definition, least-privilege IAM roles, and API Gateway HTTP API router.
* **Skills Required:**
  * `C:/Users/MSI BRAVO/.gemini/antigravity-cli/skills/cognitive-doc-design/SKILL.md`
  * `C:/Users/MSI BRAVO/.codex/plugins/cache/openai-curated-remote/app-6a0b1644959c8191a6ecd016190651cd/1.0.0/skills/aws-serverless/SKILL.md`
* **Mandatory Pre-read:**
  * [`infra/template.yaml`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/infra/template.yaml)
  * [`docs/backend-demo/design.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/design.md) (Sections 3 & 6)
  * [`docs/backend-demo/deploy-and-orca.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/deploy-and-orca.md)

---

## 1. Objective and Scope
Modernize the SAM template from a single synchronous Node 20 Lambda to a production-grade asynchronous serverless architecture running on Node.js 22 ARM64. Define the Step Functions state machine using Inline Map (`MaxConcurrency: 4`), configure the unified DynamoDB table and private S3 results bucket, set up strict IAM least-privilege execution roles, and implement the API Gateway HTTP API router.

---

## 2. Changes to Apply
1. **Step Functions State Machine (`infra/statemachine/monteCarloWorkflow.asl.json`):**
   * State 1: `CheckAiStrategy`: branch to Bedrock policy generator if requested; otherwise proceed.
   * State 2: `GenerateBatchList`: helper state generating the array of 20 lotes per strategy.
   * State 3: `ExecuteBatchesMap`: `Type: Map`, `ItemProcessor: Inline`, `MaxConcurrency: 4`. Invokes `BatchWorkerFunction`.
   * State 4: `AggregateResults`: Invokes `AggregatorFunction`.
   * Error Handling: Global `Catch` block routing to a failure handler that marks `FAILED` and releases the invitation slot.
2. **Plantilla SAM (`infra/template.yaml`):**
   * Upgrade `Globals.Function.Runtime` to `nodejs22.x`, `Architectures: [arm64]`.
   * Define resources:
     * `SpookythonBackendTable`: `AWS::DynamoDB::Table` (`PAY_PER_REQUEST`, `PK`, `SK`, `GSI1`, `GSI2`, TTL enabled on `ttl`).
     * `SpookythonResultsBucket`: `AWS::S3::Bucket` (Private, PublicAccessBlock enabled, Lifecycle rule expiring objects at 7 days).
     * `MonteCarloStateMachine`: `AWS::Serverless::StateMachine`.
     * `ApiHandlerFunction`: routes `/api/v1/*`.
     * `BatchWorkerFunction`: Node 22 worker.
     * `AggregatorFunction`: Node 22 aggregator.
     * `SpookythonBudgetAlarm`: AWS Budgets alert at $5.00 USD with SNS notification.
3. **HTTP API Router (`backend/handlers/apiHandler.ts`):**
   * Manages routes: `POST /api/v1/auth/session`, `DELETE /api/v1/auth/session`, `POST /api/v1/jobs`, `GET /api/v1/jobs`, `GET /api/v1/jobs/{id}`, `GET /api/v1/jobs/{id}/results`, `PATCH /api/v1/jobs/{id}/visibility`.
   * Immediately rejects unknown routes/methods with `404/405` prior to touching DynamoDB.

---

## 3. Strict Constraints
* **No Overly Permissive IAM Wildcards:** Explicit resource ARNs for DynamoDB, S3, and Step Functions.
* **No Public Results Bucket:** S3 results bucket must never have public access or direct CloudFront origin.
* **TDD / Validation Requirement:** Validate the template syntax using `sam validate --template-file infra/template.yaml`.

---

## 4. Affected Paths
* `infra/template.yaml` (modified)
* `infra/statemachine/monteCarloWorkflow.asl.json` (new)
* `backend/handlers/apiHandler.ts` (new)
* `infra/__tests__/samTemplateValidation.test.ts` (new test suite)

---

## 5. Acceptance Criteria and Verification
1. `sam validate --template-file infra/template.yaml` completes with zero errors.
2. `bun test infra/__tests__/samTemplateValidation.test.ts` passes 100%.
3. State machine definition adheres to AWS Step Functions Service Quotas (payloads `< 256 KiB`, passing S3 references instead of raw data).
4. API handler correctly verifies session token on every protected route.
