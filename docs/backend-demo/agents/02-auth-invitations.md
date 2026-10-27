# Task Brief 02: Invitation Authentication, Session Management, Admin CLI and Jobs API Services

## Meta Information
* **Task Identifier:** `task_agent_02_auth`
* **Target Package:** `docs/backend-demo/agents/02-auth-invitations.md`
* **Ownership Boundary:** Authentication service, DynamoDB session/invitation access, opaque token generation, secure cookie helpers, administrative CLI tool, and Jobs API admission/query services (`POST /jobs`, `GET /jobs`, `GET /jobs/shared`, `GET /jobs/{id}`, `GET /jobs/{id}/results`, `PATCH /jobs/{id}/visibility`).
* **Skills Required:**
  * `C:/Users/MSI BRAVO/.gemini/antigravity-cli/skills/cognitive-doc-design/SKILL.md`
  * `C:/Users/MSI BRAVO/.codex/plugins/cache/openai-curated-remote/app-6a0b1644959c8191a6ecd016190651cd/1.0.0/skills/aws-serverless/SKILL.md`
* **Mandatory Pre-read:**
  * [`docs/backend-demo/design.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/design.md) (Sections 1, 2 & 4)
  * [`docs/backend-demo/deploy-and-orca.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/deploy-and-orca.md)

---

## 1. Objective and Scope
Implement secure, lightweight authentication without heavy third-party identity providers (Cognito). Build the invitation verification mechanism using CSPRNG codes with >=128 bits of cryptographic entropy, 256-bit random opaque session tokens, DynamoDB SHA-256 storage (strictly zero plain-text secrets in persistence), `HttpOnly` cookie generation, an administrative CLI to provision/revoke invitations, and the core transactional services for job admission (atomic 5-item transaction), idempotent deduplication, own/shared job queries, and authenticated S3 result proxying with gzip support.

---

## 2. Changes to Apply
1. **Cryptographic and Hashing Helpers (`backend/auth/crypto.ts`):**
   * High-entropy code generator with >=128 bits of entropy (Base32/hex format, e.g. `SPK-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`).
   * 256-bit random opaque session token generator (`ses_<64 hex chars>`).
   * Constant-time SHA-256 hash function (`hashSecret(secret: string): string`).
2. **Invitation Service (`backend/auth/invitationService.ts`):**
   * `validateInvitation(code: string)`: Hashes code, looks up `PK = CODE#<hash>, SK = RESOLVE` to get `invitationId`, then fetches `PK = INV#<invitationId>, SK = METADATA`. Verifies status is `'ACTIVE'` and `expiresAt > NOW()`.
   * Error handling: returns a uniform, constant-time `401 Unauthorized` ("Invalid or expired invitation code") whether the code is non-existent, revoked, or expired.
   * Enforces 7-day maximum lifespan and quota limits (default 20 jobs/day).
3. **Session Service (`backend/auth/sessionService.ts`):**
   * `createSession(invitationId: string, codeHash: string)`: Issues new token, writes `SES#<hash(token)>` with TTL, sets expiry to `min(12h, invitation.expiresAt)`, and embeds resolved `invitationKey = INV#<invitationId>`.
   * `verifySession(token: string)`: Constant-time check on token hash in DynamoDB; verifies session expiry AND re-verifies active status of owning `INV#<invitationId>` item on every protected request.
4. **Cookie Helper (`backend/auth/cookieHelper.ts`):**
   * Generates `Set-Cookie` string: `spk_session=ses_...; HttpOnly; Secure; SameSite=Strict; Path=/api/v1; Max-Age=43200`.
5. **Job Admission and Idempotency Service (`backend/services/jobAdmissionService.ts`):**
   * Validates `Idempotency-Key` header (1..128 chars).
   * Checks `IDEMP#<invitationId>#<hash(Idempotency-Key)>`: if found and `payloadHash` matches, returns existing `jobId` immediately without consuming quota or slots. If `payloadHash` differs, throws `409 Conflict`.
   * Executes atomic 5-operation `TransactWriteItems`:
     1. Condition check / increment on `GLOBAL_QUOTA#<YYYY-MM-DD>` (`jobCount < 100`).
     2. Condition check / increment on `QUOTA#<invitationId>#<YYYY-MM-DD>` (`jobCount < 20`).
     3. Condition check on `INV#<invitationId>` (`activeJobsCount < 1`, `status == 'ACTIVE'`, `expiresAt > NOW()`), incrementing `activeJobsCount`.
     4. `PutItem` on `JOB#<jobId>` (`status = 'PENDING'`, `slotReleased = false`, `attempt = 1`, `dueTimeIso = createdAt + 15 min`, and sparse index attributes `GSI3PK = STATUS#PENDING`, `GSI3SK = dueTimeIso`).
     5. `PutItem` on `IDEMP#<invitationId>#<hash(Idempotency-Key)>` (`payloadHash`, `jobId`, TTL 7 days).
6. **Job Query and Results Service (`backend/services/jobQueryService.ts`):**
   * `listOwnJobs(invitationId)`: Queries `GSI1` ordered by date.
   * `listSharedJobs()`: Queries `GSI2` (`VISIBILITY#SHARED_INVITEES`) and performs **strong re-verification on the base table** for each candidate to ensure visibility is still shared and not expired.
   * `getJobStatus(jobId, invitationId)`: Verifies ownership or shared visibility.
   * `getJobResultsProxy(jobId, invitationId)`: Fetches private S3 object (`jobs/<jobId>/attempts/<attempt>/results.json`), compresses with gzip, and returns stream/payload.
7. **Admin CLI (`scripts/admin-invitations.ts`):**
   * Local CLI command using AWS SDK DynamoDB Client:
     * `bun run scripts/admin-invitations.ts create --label "Jurado 1" --quota 20`
     * `bun run scripts/admin-invitations.ts revoke --code "<CODE>"`
     * `bun run scripts/admin-invitations.ts list` (displays labels, hashes, and status; NEVER displays recovered plain-text codes).

---

## 3. Strict Constraints
* **Zero Plain-Text Secrets in DynamoDB or Logs:** Only `SHA-256(code)` and `SHA-256(token)` may be written to the database.
* **No Information Leaks in Login Errors:** Return generic 401 across all failure modes (missing, revoked, expired).
* **TDD Requirement:** Write unit tests first in `backend/__tests__/authAndJobsApi.test.ts` testing code validation, hash verification, session expiration, atomic admission races, idempotency deduplication, and cookie syntax before writing service implementation.

---

## 4. Affected Paths
* `backend/auth/crypto.ts` (new)
* `backend/auth/invitationService.ts` (new)
* `backend/auth/sessionService.ts` (new)
* `backend/auth/cookieHelper.ts` (new)
* `backend/services/jobAdmissionService.ts` (new)
* `backend/services/jobQueryService.ts` (new)
* `backend/__tests__/authAndJobsApi.test.ts` (new test suite)
* `scripts/admin-invitations.ts` (new admin CLI)

---

## 5. Acceptance Criteria and Verification
1. `bun test backend/__tests__/authAndJobsApi.test.ts` passes 100%.
2. Stored records in DynamoDB mock show 64-character hex strings under `PK` and `codeHash`.
3. Expired sessions (`expiresAt <= NOW()`) are strictly rejected even before DynamoDB TTL sweeps the item.
4. Concurrent submissions with same `Idempotency-Key` deduplicate cleanly without double-counting quota.
5. Admin CLI creates valid invitations with proper DynamoDB attributes and TTL.
