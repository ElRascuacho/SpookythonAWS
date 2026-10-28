---
status: Accepted
owner: "Architect"
reviewers: ["Tech Lead"]
updated_at: "2026-10-27"
feature_size: L
ticket: "committee-learning"
---

# 0006 — Enforce atomic admission quotas and a single global slot

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Architect (planning continuation)

## Context

El objetivo de diseño es 5 USD/mes. Sin admisión atómica, retries y concurrencia pueden agotar crédito. Estimación conservadora: 0.00002 USD/GB-s × 1200 GB-s/job = 2.40 USD máximo reservado de cómputo (margen API/storage/logs; no garantía de factura total).

## Decision drivers

- NFR-04 / NFR-05.
- AC-05 / AC-13.
- Browser nunca define cuotas ni pools.

## Considered options

1. **Solo alarmas de Billing** — detectan tarde; no bloquean.
2. **ReservedConcurrency=1 como único freno** — puede ser imposible por cuota; no cubre GB-s mensuales.
3. **TransactWrite: 100 jobs/mes, 120000 GB-s/mes, 1200 GB-s/job sin reembolso, 5 jobs/sesión/día, slot global 1, idempotency** — control en aplicación.

## Decision outcome

**Chosen:** Option 3. Slot DDB es fuente de verdad; RCE opcional con evidencia.

## Consequences

**Positive**
- Rechazo temprano sin sobre-reserva.
- Idempotency evita doble cobro lógico.

**Negative**
- Sin reembolso v1 aunque el job use menos.
- Reconciliación necesaria para slots colgados.

**Neutral**
- Perfil maintenance-only ≤3 jobs antes de training.

## Links

- Spec: [[../spec.md]] AC-05, AC-13, NFR-04, NFR-05
- SAD: [[../sad.md]] §6
- Related ADR: [[0001-run-learning-in-dedicated-async-worker-lambda]]
