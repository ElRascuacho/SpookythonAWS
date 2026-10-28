---
status: Accepted
owner: "Architect"
reviewers: ["ReleaseOperator", "Tech Lead"]
updated_at: "2026-10-27"
feature_size: L
ticket: "committee-learning"
---

# 0010 — Require real cloud profiling before enabling training

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Architect (planning continuation)

## Context

107 s en Bun x64 local no predicen duración ni factura de Node ARM Lambda. El brief marca cumplimiento de 5 USD/mes y crédito 140 USD como gates externos.

## Decision drivers

- AC-14 / NFR-02.
- Spec §8 open questions.

## Considered options

1. **Habilitar training con estimación local** — riesgo de sobrecoste.
2. **Perfil maintenance-only ≤3 jobs acotados, medir, luego flag de training** — gate explícito.
3. **Bloquear todo cómputo cloud hasta medirlo** — impide incluso baseline de integración autorizada.

## Decision outcome

**Chosen:** Option 2. Default: aprendizaje deshabilitado en entorno compartido hasta evidencia + autorización.

## Consequences

**Positive**
- Evita gastar crédito a ciegas.
- Permite harness de perfil controlado.

**Negative**
- Demo cloud de learning puede quedar off.
- Requiere checklist de ReleaseOperator.

**Neutral**
- Implementación local/TDD no espera el perfil.

## Links

- Spec: [[../spec.md]] AC-14, §8
- SAD: [[../sad.md]] §7
- Runbook: [[../runbook.md]]
