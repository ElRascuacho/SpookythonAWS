---
id: T3
title: "Build deterministic seed pools and run manifest serializer"
layer: "domain"
deps: []
blocks: ["T4"]
acs: ["AC-09","AC-16"]
files_hint: ["src/domain/committee/","src/domain/__tests__/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T3 — Build deterministic seed pools and run manifest serializer

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize if iles_hint overlaps siblings.

## Why (user story)

> **As a** CommitteeOperator
> **I want** reproducir días y auditar la comparación
> **So that** pueda explicar acciones y resultados.
>
> — `spec.md §4, US-04, verbatim` · [spec.md](../spec.md)

## Inlined context

> Pools disjuntos train/selection/promotion/final; collision checks; presupuesto protocolo 3552.
>
> — `algorithm.md §4–§6, abridged`

> RunManifest: versiones, pools, librarySnapshot, hashes.
>
> — `CONTEXT.md RunManifest` · `data-model.md` S3 manifest

## Data delta

No DB changes unless noted in later infra tasks. Domain-only for this task.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-09 / AC-16
Replay numérico con manifiesto; stateRevision monotónico (prep para UI/worker).
— `spec.md §5, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Contradicción brownfield vs paquete | STOP y reportar blocked |
| Scope creep | No rediseñar; seguir algorithm.md |

## Definition of Done

Serializer round-trip + pools sin colisiones

## Commands

```bash
bun test
```
