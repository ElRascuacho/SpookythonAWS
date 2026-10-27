# Task Brief 03: Data Fixtures, Provenance Manifest and Validation Suite

## Meta Information
* **Task Identifier:** `task_agent_03_fixtures`
* **Target Package:** `docs/backend-demo/agents/03-data-fixtures.md`
* **Ownership Boundary:** Static data preparation, offline compilation scripts, SHA-256 provenance manifest, and data invariant validation tests.
* **Skills Required:**
  * `C:/Users/MSI BRAVO/.gemini/antigravity-cli/skills/cognitive-doc-design/SKILL.md`
  * `C:/Users/MSI BRAVO/.codex/plugins/cache/openai-curated-remote/app-6a0b1644959c8191a6ecd016190651cd/1.0.0/skills/aws-serverless/SKILL.md`
* **Mandatory Pre-read:**
  * [`docs/backend-demo/data-sources.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/data-sources.md)
  * [`src/domain/mantaGraph.ts`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/src/domain/mantaGraph.ts)

---

## 1. Objective and Scope
Compile downloaded raw snapshots of demographic, climatic, and topological data into immutable, versioned JSON fixtures under `src/data/fixtures/`. Ensure zero live HTTP queries during simulation execution in AWS Lambda, generate a tamper-evident SHA-256 provenance manifest, and provide automated test gates enforcing zero personal identifiable information (PII) and population consistency.

---

## 2. Changes to Apply
1. **Compilation and Ingestion Script (`scripts/ingest-fixtures.ts`):**
   * Reads raw snapshots or exports from `mantaGraph.ts`.
   * Formats and validates the 16 nodes fixture (`src/data/fixtures/manta-nodes.json`).
   * Generates normalized daily climate multiplier series (`src/data/fixtures/climate-manta.json`).
   * Computes SHA-256 checksums and emits `src/data/fixtures/provenance-manifest.json`.
2. **Provenance Manifest Definition (`src/data/fixtures/provenance-manifest.json`):**
   * Structure containing `sources` array with official URLs, capture dates, methodological tags (`[OBSERVADO OFICIAL]`, `[ESTIMADO EN MALLA]`, `[PROXY NO CALIBRADO]`, `[PARÁMETRO EDUCATIVO]`), licenses (ODbL, CC BY 4.0, Public Domain), and SHA-256 hashes.
3. **Data Invariants and Validation Test Suite (`src/data/__tests__/fixturesProvenance.test.ts`):**
   * Validates that node population sum equals 264,281 inhabitants (97.5% of official Manta census: 271,145 hab.).
   * Validates that hospital capacity parameter is clearly labeled as an effective municipal contingency threshold against total infected ($I_v(t)$), not unoccupied ICU/hospital beds. Acknowledges formal calibration is deferred.
   * Scans fixture files for forbidden PII patterns (national IDs, personal patient names, phone numbers).

---

## 3. Strict Constraints
* **No Live Web Fetching in Lambda:** All fixtures must be packaged into the Lambda bundle.
* **No Speculative or Hallucinated Data:** Only verified figures from `docs/backend-demo/data-sources.md` are permitted.
* **TDD Requirement:** Write `src/data/__tests__/fixturesProvenance.test.ts` first, asserting checksum presence, file existence, and absence of PII before finalizing fixtures.

---

## 4. Affected Paths
* `scripts/ingest-fixtures.ts` (new script)
* `src/data/fixtures/manta-nodes.json` (new fixture)
* `src/data/fixtures/climate-manta.json` (new fixture)
* `src/data/fixtures/provenance-manifest.json` (new fixture)
* `src/data/__tests__/fixturesProvenance.test.ts` (new test suite)

---

## 5. Acceptance Criteria and Verification
1. `bun run scripts/ingest-fixtures.ts` generates all three JSON files with valid formatting and correct checksums.
2. `bun test src/data/__tests__/fixturesProvenance.test.ts` passes 100%.
3. Sum of node populations matches 264,281 without duplication or overlap.
4. Total fixture size `< 200 KB`, ensuring negligible impact on Lambda cold starts.
