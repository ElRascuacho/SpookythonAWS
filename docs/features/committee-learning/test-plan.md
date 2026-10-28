---
status: Draft
owner: "Tech Lead"
updated_at: "2026-10-27"
feature_size: L
---

# Test plan — committee-learning

## Coverage table

| AC | Named test | Level |
| --- | --- | --- |
| AC-01 | switching modes keeps game state and blocks committee actions into game | e2e-through-UI / component |
| AC-02 | valid start returns private job and baseline before learned progress | e2e / integration |
| AC-03 | client-supplied search pools rejected without admission | unit / contract |
| AC-04 | foreign session cannot read/cancel/download; response hides existence | integration / e2e |
| AC-05 | idempotent retry returns same job; concurrent starts yield one slot holder | integration |
| AC-06 | policy cannot see future/seeds; objective is mean cumulative infections | unit |
| AC-07 | strict mean improvement + bootstrap gate publishes ProgressVersion; tie keeps incumbent | unit |
| AC-08 | final audit failure recommends base and keeps progress history non-final | unit / e2e |
| AC-09 | replay with frozen manifest reproduces numeric totals | integration |
| AC-10 | population conservation, vaccine≤S, spend≤budget on trajectories | unit |
| AC-11 | late/duplicate delivery does not restart; single terminal CAS | integration / chaos |
| AC-12 | cancel stops further trajectories; finalAudit not-run | integration |
| AC-13 | over-quota rejected; reserved GB-s not refunded in v1 | integration |
| AC-14 | training disabled without profile authorization | contract / e2e |
| AC-15 | library warmstarts expose weights only, no owner/seeds | unit / integration |
| AC-16 | stale status payload cannot decrease stateRevision in UI | component / unit |

## Strategy

- **Unit:** algorithm, policy, RNG namespaces, bootstrap, admission pure validators, engine seam parity (4-arg identical).
- **Integration:** real DynamoDB Local or authorized ephemeral AWS table/bucket — **no** in-memory stand-in labeled as cloud E2E.
- **Contract:** OpenAPI responses/error codes for committee routes.
- **E2E / e2e-through-UI:** ModeShell + start/poll/playback happy path with mocked worker only when explicitly marked; storage tests still real.
- **Chaos:** duplicate invoke, cancel-before-start, hard timeout, orphan slot reconcile.
- **Load:** NFR-01 admission/status only (2 req/s, 60 s, p95 ≤ 1500 ms) with tool already in repo or e.g. k6/Locust. NFR-02 is a **cloud profile gate**, not a CI invent.

## Data / cleanup

Factories for scenario fixtures; unique ownerHash per test; cleanup per suite on table prefix + S3 prefix. Never use production buckets.

## CI placement

- PR: unit + contract + DynamoDB Local integration.
- Pre-release / authorized: chaos + profile harness.
- Load NFR-01 on schedule or pre-release.
