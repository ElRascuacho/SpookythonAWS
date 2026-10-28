---
id: T10
title: "Implement private S3 result store and policy library"
layer: "infra"
deps: ["T8"]
blocks: ["T11","T12"]
acs: ["AC-09","AC-15"]
files_hint: ["backend/committee/","backend/__tests__/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T10 — Implement private S3 result store and policy library

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> Artefactos privados + library ≤8 pesos compatibles.
>
> — `ADR-0005 ADR-0008`

## Inlined context

> Put S3 luego CAS DDB; sin signed URLs públicas; library sin owner/seeds.
>
> — `data-model.md` S3 layout

## Data delta

Ver data-model.md keys/TTL/CAS tocados por esta tarea.

## API contract

Ver contracts/openapi.yaml / events.md según capa.

## Acceptance criteria

### AC-09 / AC-15
Manifiesto reproducible; warmstarts sin filtrar privados.
— `spec.md §5, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Deploy accidental | Prohibido sin ReleaseOperator |
| In-memory fingiendo cloud | Prohibido en tests de storage |

## Definition of Done

Integration tests escriben/leen prefix privado

## Commands

```bash
bun test
```
