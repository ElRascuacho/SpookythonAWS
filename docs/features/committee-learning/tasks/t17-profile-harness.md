---
id: T17
title: "Add maintenance-only cloud profile harness gated by authorization"
layer: "tests"
deps: ["T12","T16"]
blocks: ["T18"]
acs: ["AC-14"]
files_hint: ["scripts/","docs/features/committee-learning/runbook.md"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T17 — Add maintenance-only cloud profile harness gated by authorization

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> Medir coste/duración real antes de habilitar training.
>
> — `ADR-0010` · `runbook.md`

## Inlined context

> Máx 3 jobs acotados; requiere flag env explícito; no inventar timings.
>
> — `spec.md AC-14` · `NFR-02`

## Data delta

No DB schema beyond already staged docs unless this task is infra/tests verifying it.

## API contract

UI/tests consume contracts/openapi.yaml where applicable.

## Acceptance criteria

### AC-14
Sin evidencia/autorización ⇒ learning off.
— `spec.md §5 AC-14, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Rediseño tentador | STOP |
| Credenciales/prod | No usar sin autorización |

## Definition of Done

Script dry-run sin credenciales; live path documentado en runbook

## Commands

```bash
bun test
```
