---
id: T11
title: "Expose authenticated committee HTTP routes on interactive handler"
layer: "ports"
deps: ["T9","T10"]
blocks: ["T14","T16"]
acs: ["AC-02","AC-03","AC-04","AC-14"]
files_hint: ["backend/handler.ts","backend/committee/","backend/__tests__/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T11 — Expose authenticated committee HTTP routes on interactive handler

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> POST/GET/DELETE committee jobs + manifest/playback proxy.
>
> — `contracts/openapi.yaml`

## Inlined context

> Cookie auth; Idempotency-Key; rechazar pools/pesos cliente; 503 training_disabled; 404 oculto.
>
> — `openapi.yaml` · `ADR-0002`

## Data delta

Ver data-model.md keys/TTL/CAS tocados por esta tarea.

## API contract

Ver contracts/openapi.yaml / events.md según capa.

## Acceptance criteria

### AC-02 / AC-03 / AC-04 / AC-14
Start privado; reject inválidos; deny cruzado; disabled gate.
— `spec.md §5, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Deploy accidental | Prohibido sin ReleaseOperator |
| In-memory fingiendo cloud | Prohibido en tests de storage |

## Definition of Done

Contract tests alineados a OpenAPI ejemplos/errores

## Commands

```bash
bun test
```
