---
id: T13
title: "Add ModeShell keeping App mounted across mode switches"
layer: "ui"
deps: []
blocks: ["T14"]
acs: ["AC-01"]
files_hint: ["src/InvitationGate.tsx","src/ModeShell.tsx","src/App.tsx"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T13 — Add ModeShell keeping App mounted across mode switches

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> **As a** CommitteeOperator
> **I want** entrar en Comité sin perder el acceso al juego y la campaña
> **So that** pueda distinguir análisis automático y decisiones manuales.
>
> — `spec.md §4, US-01, verbatim`

## Inlined context

> ModeShell dentro del gate; App montado/oculto; Comité no inyecta acciones al juego.
>
> — `ADR-0007` · `screens.md SCR-01`

## Data delta

No DB schema beyond already staged docs unless this task is infra/tests verifying it.

## API contract

UI/tests consume contracts/openapi.yaml where applicable.

## Acceptance criteria

### AC-01
Cross-context: modos separados; juego sin acciones Comité.
— `spec.md §5 AC-01, verbatim intent`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Rediseño tentador | STOP |
| Credenciales/prod | No usar sin autorización |

## Definition of Done

Test/component: toggle modes preserves game state object

## Commands

```bash
bun test
```
