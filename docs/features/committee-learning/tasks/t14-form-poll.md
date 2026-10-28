---
id: T14
title: "Build committee form and polling progress panel"
layer: "ui"
deps: ["T11","T13"]
blocks: ["T15"]
acs: ["AC-02","AC-03","AC-16"]
files_hint: ["src/committee/","src/ModeShell.tsx"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T14 — Build committee form and polling progress panel

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> Formulario escenario + panel progreso con baseline primero.
>
> — `ux-flows.md F2` · `screens.md SCR-02 SCR-03`

## Inlined context

> Poll 2s visible / 10s oculto; ignorar stateRevision menor; no campos CEM en cliente.
>
> — `NFR-07` · `openapi StartCommitteeJobRequest`

## Data delta

No DB schema beyond already staged docs unless this task is infra/tests verifying it.

## API contract

UI/tests consume contracts/openapi.yaml where applicable.

## Acceptance criteria

### AC-02 / AC-03 / AC-16
Baseline visible; reject inválidos; revision monotónica en UI.
— `spec.md §5, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Rediseño tentador | STOP |
| Credenciales/prod | No usar sin autorización |

## Definition of Done

UI states SCR-02/03 + stale revision ignored

## Commands

```bash
bun test
```
