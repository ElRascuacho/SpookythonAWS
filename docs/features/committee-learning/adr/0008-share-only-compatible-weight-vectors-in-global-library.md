---
status: Accepted
owner: "Architect"
reviewers: ["Security Lead"]
updated_at: "2026-10-27"
feature_size: L
ticket: "committee-learning"
---

# 0008 — Share only compatible weight vectors in a global library

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Architect (planning continuation)

## Context

El enfoque híbrido reutiliza experiencia entre escenarios, pero compartir manifiestos/seeds/owner filtraría trabajos privados.

## Decision drivers

- AC-15.
- Brief E3 híbrido.

## Considered options

1. **Sin reutilización** — desperdicia evidencia.
2. **Compartir manifiestos completos** — fuga de privacidad.
3. **Library ≤8 vectores + versiones de compatibilidad, sin owner/job/seeds** — warmstarts dentro del presupuesto.

## Decision outcome

**Chosen:** Option 3. Snapshot de library al inicio del job en el manifiesto.

## Consequences

**Positive**
- Warmstarts sin llamadas extra ni PII de jobs.

**Negative**
- Seed sola no reproduce tras evolución de library.
- Evicción necesaria al llenar 8.

**Neutral**
- Solo archivar tras FinalAudit favorable.

## Links

- Spec: [[../spec.md]] AC-15
- SAD: [[../sad.md]] §4
