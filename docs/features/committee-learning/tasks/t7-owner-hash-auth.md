---
id: T7
title: "Add shared ownerHash helper from validated manta_session nonce"
layer: "app"
deps: []
blocks: ["T9"]
acs: ["AC-04"]
files_hint: ["backend/auth.ts","backend/__tests__/auth.test.ts"]
owner: "coding-agent"
estimate: "M"
context_budget: "M"
status: "todo"
step: ""
---

# T7 — Add shared ownerHash helper from validated manta_session nonce

## Place in the sequence

- **Blocked by:** deps $(System.Collections.Hashtable.deps) · **Blocks:** $(System.Collections.Hashtable.blocks) · **Wave:** see _epic.md.
- **Lane:** serialize overlapping hints.

## Why (user story)

> **As a** CommitteeOperator
> **I want** búsquedas privadas por sesión
> **So that** otro login con el mismo código no vea mis resultados.
>
> — `spec.md §4 US-02 / AC-04, abridged`

## Inlined context

> Cookie `manta_session=codeHash.expiry.randomNonce.signature`; ownerHash del nonce tras validar HMAC; preservar contrato login JSON.
>
> — `ADR-0002` · brownfield `backend/auth.ts`

## Data delta

Ver data-model.md keys/TTL/CAS tocados por esta tarea.

## API contract

Ver contracts/openapi.yaml / events.md según capa.

## Acceptance criteria

### AC-04
Sesión ausente/caducada/distinta deniega sin filtrar existencia.
— `spec.md §5 AC-04, abridged`

## Edge cases

| Case | Behaviour |
| --- | --- |
| Deploy accidental | Prohibido sin ReleaseOperator |
| In-memory fingiendo cloud | Prohibido en tests de storage |

## Definition of Done

Tests: mismo codeHash distinto nonce ⇒ distinto ownerHash; cookie inválida no deriva owner

## Commands

```bash
bun test
```
