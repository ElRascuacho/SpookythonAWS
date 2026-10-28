---
id: T8
title: "Stage SAM resources for CommitteeTable, results bucket, and worker"
layer: "wiring"
deps: []
blocks: ["T9","T10"]
acs: ["AC-14"]
files_hint: ["infra/template.yaml","docs/features/committee-learning/migrations/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T8 — Stage SAM resources for CommitteeTable, results bucket, and worker

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> Infra mínima para worker 2048MB/600s, tabla y bucket privados; training flag default off.
>
> — `sad.md §7` · `ADR-0001 ADR-0010`

## Inlined context

> No cambiar timeout 15s de Lambda interactiva; no Step Functions; RCE=1 opcional.
>
> — `CONTINUE-HERE` / `migrations/01..02`

## Data delta

Ver data-model.md keys/TTL/CAS tocados por esta tarea.

## API contract

Ver contracts/openapi.yaml / events.md según capa.

## Acceptance criteria

### AC-14
Aprendizaje permanece deshabilitado sin autorización.
— `spec.md §5 AC-14, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Deploy accidental | Prohibido sin ReleaseOperator |
| In-memory fingiendo cloud | Prohibido en tests de storage |

## Definition of Done

Diff SAM revisable; sin deploy en esta tarea

## Commands

```bash
bun test
```
