---
id: T1
title: "Add optional fifth options seam to runSingleSeirSimulation with parity tests"
layer: "domain"
deps: []
blocks: ["T2"]
acs: ["AC-06","AC-10"]
files_hint: ["src/domain/seirEngine.ts","src/domain/prng.ts","src/domain/__tests__/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T1 — Add optional fifth options seam to runSingleSeirSimulation with parity tests

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize if iles_hint overlaps siblings.

## Why (user story)

> **As a** CommitteeOperator
> **I want** comparar políticas de forma justa dentro de la simulación
> **So that** la media de contagios refleje la política y no un RNG sesgado.
>
> — `spec.md §4, US-03, abridged` · [spec.md](../spec.md)

Esta tarea agrega el seam del motor sin romper callers de 4 argumentos.

## Inlined context

> Quinto options opcional `{ onDailyDecision?, envNamespace? }`; salidas numéricas de cuatro argumentos idénticas; no LEARNED en StrategyType.
>
> — `sad.md §8 / ADR-0011, abridged` · [adr/0011](../adr/0011-extend-simulator-with-optional-fifth-options-argument.md)

> Namespace ambiental independiente de política para pools Comité.
>
> — `ADR-0004, abridged`

## Data delta

No DB changes unless noted in later infra tasks. Domain-only for this task.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-06 / AC-10 (abridged)
Política sin futuro/semillas; conservación población, vacuna≤S, gasto≤presupuesto.
— `spec.md §5, AC-06 AC-10, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Contradicción brownfield vs paquete | STOP y reportar blocked |
| Scope creep | No rediseñar; seguir algorithm.md |

## Definition of Done

Tests de paridad profunda 4-arg pasan; options override envNamespace y callback diario

## Commands

```bash
bun test
```
