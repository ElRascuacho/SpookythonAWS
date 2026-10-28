# API sync report — committee-learning

## Field origins (sample)

| operation.field | origin | confidence |
| --- | --- | --- |
| POST body.horizonDays | data-model Job.horizonDays + algorithm default/range | high |
| POST body.*scenario | spec US-02 + data-model scenarioHash inputs | high |
| Idempotency-Key | sad §6 + ADR-0006 | high |
| status.stateRevision | data-model Job.stateRevision / NFR-08 | high |
| finalAuditStatus | algorithm FinalAudit + AC-08/12 | high |
| Error committee.not_found | AC-04 hide existence | high |
| Error committee.training_disabled | AC-14 / ADR-0010 | high |

## Drift checklist

| Check | Result |
| --- | --- |
| Endpoints ↔ user stories | ✓ US-02 start/status; US-05 cancel; US-04 manifest/playback |
| Errors ↔ sequences/AC | ✓ quota/slot/auth/disabled/invalid |
| Fields ↔ data-model | ✓ no client pools/quotas/weights |
| Async documented | ✓ events.md invoke.v1 |

## Coverage back-feed

| AC | Mapped operations |
| --- | --- |
| AC-02 | POST jobs 202 |
| AC-03 | POST 400 |
| AC-04 | GET/DELETE/manifest/playback 401/404 hidden |
| AC-05 | Idempotency + 409 slot |
| AC-08/12 | status.finalAuditStatus |
| AC-13 | 429 quota |
| AC-14 | 503 training_disabled |
| AC-16 | stateRevision monotonic (contract + tests) |

Gaps consciously deferred to tests/UI (not OpenAPI): ModeShell AC-01, map playback rendering, bootstrap math.
