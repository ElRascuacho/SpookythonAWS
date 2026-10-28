---
status: Accepted
owner: "Architect"
reviewers: ["Tech Lead"]
updated_at: "2026-10-27"
feature_size: L
ticket: "committee-learning"
---

# 0011 — Extend simulator with optional fifth options argument

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Architect (planning continuation)

## Context

Hace falta callback diario de política y namespace ambiental override sin romper callers existentes ni añadir `LEARNED` a `StrategyType`.

## Decision drivers

- Paridad numérica del motor.
- ADR-0004 namespaces.
- No contaminar el enum legado usado por juego/MC.

## Considered options

1. **Nuevo StrategyType LEARNED** — acopla UI/MC legado y salting.
2. **Fork del engine solo para Comité** — divergencia de paridad.
3. **Quinto parámetro options opcional** `{ onDailyDecision?, envNamespace? }` compatible — 4-arg idéntico.

## Decision outcome

**Chosen:** Option 3. Tests de paridad profunda obligatorios en la tarea de seam.

## Consequences

**Positive**
- Extensión no disruptiva.
- Políticas Comité fuera del enum.

**Negative**
- Call sites deben documentar cuándo pasar options.
- Adapter de research queda obsoleto como runtime (solo evidencia).

**Neutral**
- manualActions sigue teniendo precedencia donde aplique el juego.

## Links

- Spec: [[../spec.md]] AC-06, AC-10
- SAD: [[../sad.md]] §8
- Related ADR: [[0004-keep-policy-independent-environmental-rng-namespaces]]
