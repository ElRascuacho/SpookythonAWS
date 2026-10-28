---
status: Accepted
owner: "Architect"
reviewers: ["Tech Lead"]
updated_at: "2026-10-27"
feature_size: L
ticket: "committee-learning"
---

# 0003 — Use explainable four-weight CEM with progressive promotion

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Architect (planning continuation)

## Context

La evidencia local muestra empate en estándar y ~3% de mejora en un escenario alterado con una familia de 4 log-multiplicadores. El producto exige experiencia progresiva y auditoría final intacta, sin NN ni LLM.

## Decision drivers

- Brief: híbrido + progresivo + media a 40 días.
- Evidence: familia estrecha viable; no mejora universal.
- NFR-08: ≤8 promociones; revisión monotónica.

## Considered options

1. **Solo más Monte Carlo de SGC/RANDOM/NONE** — no aprende.
2. **RL / red neuronal / Bedrock en el bucle** — fuera de presupuesto y explicabilidad v1.
3. **CEM sobre 4 pesos + promoción progresiva + FinalAudit** — alineado a evidencia y brief.

## Decision outcome

**Chosen:** Option 3. Detalle normativo en `algorithm.md` (presupuesto 3552, Bonferroni, pools disjuntos).

## Consequences

**Positive**
- Explicable; zero-policy = SGC; reproducible con manifiesto.
- Empate/fallo conserva incumbente.

**Negative**
- No descubre lógicas de intervención fuera de la familia.
- Protocolo de producto ≠ experimento archivado; no sobreclamar validación.

**Neutral**
- Warmstarts de library caben en los 24 candidatos/gen.

## Links

- Spec: [[../spec.md]] US-03
- SAD: [[../sad.md]] §4
- Algorithm: [[../algorithm.md]]
