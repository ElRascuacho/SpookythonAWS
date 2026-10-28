---
id: T16
title: "Add integration and chaos tests against real DynamoDB Local or ephemeral AWS"
layer: "tests"
deps: ["T11","T12"]
blocks: ["T17","T18"]
acs: ["AC-04","AC-05","AC-11","AC-13"]
files_hint: ["backend/__tests__/","tests/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T16 — Add integration and chaos tests against real DynamoDB Local or ephemeral AWS

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> Cubrir ownership, idempotency, quotas, duplicate invoke, cancel-before-start.
>
> — `test-plan.md`

## Inlined context

> Real DynamoDB Local o AWS efímero autorizado; nunca in-memory como E2E cloud.
>
> — `CONTINUE-HERE` instrucción 5 · `ADR-0006`

## Data delta

No DB schema beyond already staged docs unless this task is infra/tests verifying it.

## API contract

UI/tests consume contracts/openapi.yaml where applicable.

## Acceptance criteria

### AC-04 / AC-05 / AC-11 / AC-13
Privacidad; admisión única; fallos infra; cuotas.
— `spec.md §5, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Rediseño tentador | STOP |
| Credenciales/prod | No usar sin autorización |

## Definition of Done

Suite verde documentada con setup Local; chaos cases named

## Commands

```bash
bun test
```
