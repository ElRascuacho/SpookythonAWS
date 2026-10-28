---
id: T5
title: "Implement progressive promotion gates and final audit"
layer: "domain"
deps: ["T4"]
blocks: ["T6"]
acs: ["AC-07","AC-08","AC-16"]
files_hint: ["src/domain/committee/","src/domain/__tests__/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T5 — Implement progressive promotion gates and final audit

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize if iles_hint overlaps siblings.

## Why (user story)

> Promoción ≤8 con Bonferroni; FinalAudit intacta puede devolver a SGC.
>
> — `algorithm.md §6, abridged`

## Inlined context

> Empate conserva incumbente; no archivar rechazadas; finalAudit not-run en cancel.
>
> — `ADR-0003` · `spec.md AC-07 AC-08 AC-12`

## Data delta

No DB changes unless noted in later infra tasks. Domain-only for this task.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-07 / AC-08 / AC-16 verbatim intent
ProgressVersion solo con evidencia; fallo final → base; revision crece.
— `spec.md §5, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Contradicción brownfield vs paquete | STOP y reportar blocked |
| Scope creep | No rediseñar; seguir algorithm.md |

## Definition of Done

Fixture tie/fail/pass cubiertos con bootstrap seed fija

## Commands

```bash
bun test
```
