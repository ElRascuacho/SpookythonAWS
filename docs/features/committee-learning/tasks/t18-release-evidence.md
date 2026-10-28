---
id: T18
title: "Collect release evidence checklist and update package readiness notes"
layer: "docs"
deps: ["T15","T16","T17"]
blocks: []
acs: ["AC-14"]
files_hint: ["docs/features/committee-learning/","README.md"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T18 — Collect release evidence checklist and update package readiness notes

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> Cerrar documentación de gates externos sin fingir readiness cloud.
>
> — `spec.md §8` · `runbook.md`

## Inlined context

> No auto-commit; no alterar cita idea-brief §1; actualizar readiness solo con evidencia real.
>
> — `AGENTS.md` · `CONTINUE-HERE`

## Data delta

No DB schema beyond already staged docs unless this task is infra/tests verifying it.

## API contract

UI/tests consume contracts/openapi.yaml where applicable.

## Acceptance criteria

### AC-14
Requisitos pendientes explícitos para ReleaseOperator.
— `spec.md §5 AC-14 / §8, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Rediseño tentador | STOP |
| Credenciales/prod | No usar sin autorización |

## Definition of Done

Checklist de release con pendientes explícitos; sin cifras cloud inventadas

## Commands

```bash
bun test
```
