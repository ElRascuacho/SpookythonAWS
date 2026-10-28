---
id: T6
title: "Implement committee runner with cancel checks and 3552 cap ledger"
layer: "app"
deps: ["T5"]
blocks: ["T12"]
acs: ["AC-11","AC-12","AC-13"]
files_hint: ["src/domain/committee/","backend/workers/","src/domain/__tests__/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T6 — Implement committee runner with cancel checks and 3552 cap ledger

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize if iles_hint overlaps siblings.

## Why (user story)

> Runner orquesta baseline→train→selection→promotion→final con ledger.
>
> — `algorithm.md §4` · `sad.md §6`

## Inlined context

> Soft 480s / hard 600s / ≤4096; cancel antes de cada trayectoria; no resume.
>
> — `NFR-03` · `ADR-0001`

## Data delta

No DB changes unless noted in later infra tasks. Domain-only for this task.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-11 / AC-12 / AC-13
Una terminalización; cancel conserva progress; no exceder caps.
— `spec.md §5, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Contradicción brownfield vs paquete | STOP y reportar blocked |
| Scope creep | No rediseñar; seguir algorithm.md |

## Definition of Done

Ledger y cancel/timeout tests en memoria de dominio

## Commands

```bash
bun test
```
