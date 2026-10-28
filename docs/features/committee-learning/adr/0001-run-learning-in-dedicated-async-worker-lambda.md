---
status: Accepted
owner: "Architect"
reviewers: ["Tech Lead"]
updated_at: "2026-10-27"
feature_size: L
ticket: "committee-learning"
---

# 0001 — Run learning in a dedicated async worker Lambda

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Architect (planning continuation)

## Context

Una búsqueda Comité puede requerir hasta 3552 trayectorias y minutos de CPU. La Lambda interactiva actual tiene 15 s / 512 MB y no debe bloquearse ni ampliarse para aprendizaje.

## Decision drivers

- NFR-01: admisión/consulta interactivas p95 ≤ 1500 ms.
- NFR-03: soft 480 s / hard 600 s / ≤ 4096 trayectorias.
- Conservar deadline y rutas existentes del handler demo.

## Considered options

1. **Ampliar la Lambda HTTP a 600 s / 2 GB** — acopla UI a cómputo largo y degrada el runtime compartido.
2. **Step Functions Map por trayectoria** — orquestación pesada, coste/complejidad altos para v1.
3. **Worker Lambda async dedicado (Node 22 ARM 2048 MB / 600 s)** — API delgada + un proceso de búsqueda.

## Decision outcome

**Chosen:** Option 3. La API solo admite/consulta/cancela/proxy; el worker ejecuta el protocolo completo.

## Consequences

**Positive**
- Aísla límites de tiempo/memoria del path interactivo.
- Un solo proceso simplifica ledger, cancel-check y CAS.

**Negative**
- Requiere claim idempotente ante invokes duplicados.
- Perfil cloud obligatorio (timings no transferibles desde Bun local).

**Neutral**
- ReservedConcurrency=1 queda como hardening opcional, no requisito de admisión.

## Links

- Spec: [[../spec.md]] US-02 / NFR-01..03
- SAD: [[../sad.md]] §4–§5
- Related ADR: [[0006-enforce-atomic-admission-quotas-and-single-global-slot]]
