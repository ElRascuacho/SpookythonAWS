---
id: T12
title: "Wire async committee worker invoke, claim, and terminal publish"
layer: "wiring"
deps: ["T6","T9","T10"]
blocks: ["T16","T17"]
acs: ["AC-11","AC-12"]
files_hint: ["backend/workers/","backend/committee/","backend/__tests__/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T12 — Wire async committee worker invoke, claim, and terminal publish

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> Invoke async; claim; runner; CAS terminal; stateRevision++.
>
> — `events.md committee.job.invoke.v1` · `ADR-0001`

## Inlined context

> AsyncMaximumRetryAttempts=0; duplicate invoke exits; cancel/timeout finalAudit not-run.
>
> — `sad.md §6.2`

## Data delta

Ver data-model.md keys/TTL/CAS tocados por esta tarea.

## API contract

Ver contracts/openapi.yaml / events.md según capa.

## Acceptance criteria

### AC-11 / AC-12
Sin reinicio; cancel acotado.
— `spec.md §5, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Deploy accidental | Prohibido sin ReleaseOperator |
| In-memory fingiendo cloud | Prohibido en tests de storage |

## Definition of Done

Chaos unit/integration de claim duplicado y cancel

## Commands

```bash
bun test
```
