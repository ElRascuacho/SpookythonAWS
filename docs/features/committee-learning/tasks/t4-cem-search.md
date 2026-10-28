---
id: T4
title: "Implement CEM search using train pool only"
layer: "domain"
deps: ["T2","T3"]
blocks: ["T5"]
acs: ["AC-06","AC-07"]
files_hint: ["src/domain/committee/","src/domain/__tests__/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T4 — Implement CEM search using train pool only

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize if iles_hint overlaps siblings.

## Why (user story)

> CEM 8×24×8, 6 élites, momento 0.7, σ 1.3/piso 0.15; fitness solo train.
>
> — `algorithm.md §5, abridged`

## Inlined context

> Prohibido retroalimentar selection/promotion/final al centro; searchIncumbent ≠ publishedIncumbent; warmstarts dentro de 24.
>
> — `algorithm.md §5` · `ADR-0003`

## Data delta

No DB changes unless noted in later infra tasks. Domain-only for this task.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-06 / AC-07
Media acumulada; mejora estricta requerida antes de promoción (prep).
— `spec.md §5, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Contradicción brownfield vs paquete | STOP y reportar blocked |
| Scope creep | No rediseñar; seguir algorithm.md |

## Definition of Done

Tests demuestran aislamiento de pools en updates CEM

## Commands

```bash
bun test
```
