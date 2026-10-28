# Events — committee-learning

Async boundary: API → Lambda async invoke del Committee Worker. No EventBridge bus de dominio en v1.

## committee.job.invoke.v1

| Field | Value |
| --- | --- |
| Producer | Interactive API after successful admission |
| Consumer | Committee Worker |
| Delivery | Lambda async (`InvocationType=Event`) |
| Retry | `AsyncMaximumRetryAttempts=0`; max event age 120 s |
| Idempotency | Worker conditional claim `queued→running` once; duplicates exit |

### Payload

```json
{
  "jobId": "<uuid>",
  "ownerHash": "<server-derived>",
  "reservedGbs": 1200,
  "softDeadlineAt": "<iso>",
  "hardDeadlineAt": "<iso>"
}
```

El worker **relee** el job desde DynamoDB y no confía en pools/cuotas del payload del navegador (el navegador no produce este evento).

## Internal progress markers (not public bus)

Escritos como artefactos S3 + CAS DDB, no como eventos SNS/SQS:

- `progress.baseline.v1`
- `progress.promoted.vN`
- `progress.final_audit.v1`
- `progress.terminal.v1`

## DLQ

Sin cola de dominio v1. Fallos terminales quedan en status DDB `failed`/`timed-out` tras reconciliación. Si se añade DLQ después, requiere ADR.
