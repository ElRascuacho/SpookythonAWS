---
id: T9
title: "Implement DynamoDB admission, slot claim, and status CAS"
layer: "infra"
deps: ["T7","T8"]
blocks: ["T11","T12"]
acs: ["AC-05","AC-11","AC-13"]
files_hint: ["backend/committee/","backend/__tests__/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T9 — Implement DynamoDB admission, slot claim, and status CAS

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> Admisión atómica 100 jobs / 120000 GBs / 1200 GBs/job / 5/sesión/día / slot 1 / idempotency.
>
> — `ADR-0006` · `data-model.md`

## Inlined context

> TransactWrite; claim queued→running una vez; reconcile queued expirados y running vencidos; TTL no corrector.
>
> — `sad.md §6.3` · `data-model.md`

## Data delta

Ver data-model.md keys/TTL/CAS tocados por esta tarea.

## API contract

Ver contracts/openapi.yaml / events.md según capa.

## Acceptance criteria

### AC-05 / AC-11 / AC-13
Idempotency; una terminalización; rechazo por cuota.
— `spec.md §5, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Deploy accidental | Prohibido sin ReleaseOperator |
| In-memory fingiendo cloud | Prohibido en tests de storage |

## Definition of Done

Tests con DynamoDB Local o AWS efímero autorizado

## Commands

```bash
bun test
```
