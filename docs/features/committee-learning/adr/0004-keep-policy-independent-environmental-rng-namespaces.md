---
status: Accepted
owner: "Architect"
reviewers: ["Tech Lead"]
updated_at: "2026-10-27"
feature_size: L
ticket: "committee-learning"
---

# 0004 — Keep policy-independent environmental RNG namespaces

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Architect (planning continuation)

## Context

El motor actual incorpora la identidad de estrategia en el namespace RNG ambiental. Comparar políticas aprendidas con SGC bajo ese salting sesga las réplicas pareadas.

## Decision drivers

- AC-06 comparaciones justas.
- Evidencia research usó namespace fijo `SMART_CORTAFUEGOS` para candidatas y SGC.

## Considered options

1. **Conservar salting por StrategyType también para aprendidas** — comparaciones injustas.
2. **Namespace ambiental común independiente de política para pools Comité** — paired seeds.
3. **Common random numbers perfectos por transición** — no garantizable con ramas binomiales estado-dependientes.

## Decision outcome

**Chosen:** Option 2. Streams search/bootstrap/decision separados. RANDOM/NONE mantienen namespaces fuente en auditoría final.

## Consequences

**Positive**
- Comparaciones matched-seed entre políticas del Comité.

**Negative**
- No garantiza ruido idéntico nodo-a-nodo si el consumo de draws diverge.
- Requiere seam de options en el motor.

**Neutral**
- Paridad de llamadas de 4 argumentos al motor legado se preserva.

## Links

- Spec: [[../spec.md]] AC-06
- SAD: [[../sad.md]] §4
- Related ADR: [[0011-extend-simulator-with-optional-fifth-options-argument]]
