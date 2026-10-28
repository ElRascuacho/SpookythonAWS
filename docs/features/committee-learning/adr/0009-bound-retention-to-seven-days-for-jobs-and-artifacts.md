---
status: Accepted
owner: "Architect"
reviewers: ["Tech Lead"]
updated_at: "2026-10-27"
feature_size: L
ticket: "committee-learning"
---

# 0009 — Bound retention to seven days for jobs and artifacts

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Architect (planning continuation)

## Context

Hay que limitar almacenamiento y superficie de fuga. El usuario no fijó retención; el arquitecto propone 7 días alineado a demos previas.

## Decision drivers

- NFR-06 retención lógica 7 días.
- Coste de S3/DDB/logs bajo presupuesto piloto.

## Considered options

1. **Retención indefinida** — coste y riesgo crecen.
2. **1 día** — insuficiente para revisar evidencia del pitch.
3. **7 días lógicos + TTL DDB + lifecycle S3 + logs 7 días** — supuesto explícito.

## Decision outcome

**Chosen:** Option 3. TTL no sustituye reconciliación de estados.

## Consequences

**Positive**
- Cota clara de retención.

**Negative**
- Trabajos antiguos dejan de ser consultables.
- Supuesto reversible si ReleaseOperator pide otro valor.

**Neutral**
- Lectura debe tratar items expirados como no disponibles al owner sin filtrar a terceros.

## Links

- Spec: [[../spec.md]] NFR-06
- SAD: [[../sad.md]] §2
