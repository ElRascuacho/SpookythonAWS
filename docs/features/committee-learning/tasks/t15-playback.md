---
id: T15
title: "Build playback adapters on Cure maps without CureGame"
layer: "ui"
deps: ["T14"]
blocks: ["T18"]
acs: ["AC-09"]
files_hint: ["src/committee/","src/components/CureEarth3DMap.tsx","src/components/CureCityMap.tsx"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T15 — Build playback adapters on Cure maps without CureGame

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> Playback diario con snapshots/action.
>
> — `ux-flows.md F4` · `screens.md SCR-05`

## Inlined context

> Reutilizar CureEarth3DMap/CureCityMap; no instanciar CureGame.
>
> — `CONTINUE-HERE` brownfield · `ADR-0007`

## Data delta

No DB schema beyond already staged docs unless this task is infra/tests verifying it.

## API contract

UI/tests consume contracts/openapi.yaml where applicable.

## Acceptance criteria

### AC-09
Reproduce acciones/resultados diarios para versión validada.
— `spec.md §5 AC-09, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Rediseño tentador | STOP |
| Credenciales/prod | No usar sin autorización |

## Definition of Done

Adapter renderiza day N desde PlaybackDay API shape

## Commands

```bash
bun test
```
