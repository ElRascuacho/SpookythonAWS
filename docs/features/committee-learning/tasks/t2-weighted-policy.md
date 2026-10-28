---
id: T2
title: "Implement explainable four-weight policy equal to SGC at zero vector"
layer: "domain"
deps: ["T1"]
blocks: ["T4"]
acs: ["AC-06","AC-10"]
files_hint: ["src/domain/committee/","src/domain/strategies.ts","src/domain/__tests__/"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T2 — Implement explainable four-weight policy equal to SGC at zero vector

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize if iles_hint overlaps siblings.

## Why (user story)

> Familia de 4 log-multiplicadores; vector 0 ≡ SGC exacto.
>
> — `algorithm.md §2, abridged` · [algorithm.md](../algorithm.md)

## Inlined context

> Copiar reglas SGC de generación de candidatos/caps/costos/desempate; early=floor(0.45*H).
>
> — `algorithm.md §2, abridged` · `ADR-0003`

## Data delta

No DB changes unless noted in later infra tasks. Domain-only for this task.

## API contract

Internal — no API surface.

## Acceptance criteria

### AC-06 / AC-10
Misma invariantes de dominio que T1 sobre trayectorias weighted.
— `spec.md §5, AC-06 AC-10, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Contradicción brownfield vs paquete | STOP y reportar blocked |
| Scope creep | No rediseñar; seguir algorithm.md |

## Definition of Done

Zero-policy deep-equal a SGC fuente en semillas fixture

## Commands

```bash
bun test
```
