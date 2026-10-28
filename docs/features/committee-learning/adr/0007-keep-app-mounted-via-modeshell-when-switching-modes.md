---
status: Accepted
owner: "Architect"
reviewers: ["Tech Lead"]
updated_at: "2026-10-27"
feature_size: L
ticket: "committee-learning"
---

# 0007 — Keep App mounted via ModeShell when switching modes

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Architect (planning continuation)

## Context

Hoy `InvitationGate` monta `App` solo con sesión y no existe ModeShell. Alternar modos desmontando `App` perdería el estado de la partida manual (AC-01).

## Decision drivers

- AC-01 cross-context.
- Brief: conservar juego y campaña.

## Considered options

1. **Rutas que desmontan App** — pierde partida al visitar Comité.
2. **ModeShell mantiene App montado/oculto + Comité hermano** — estado de juego intacto.
3. **Persistir partida en localStorage** — fuera de alcance y frágil para demo.

## Decision outcome

**Chosen:** Option 2. ModeShell dentro del gate; Comité no envía acciones al juego.

## Consequences

**Positive**
- Cumple separación de modos sin pérdida de progreso en memoria.

**Negative**
- Mayor memoria residente al tener ambos árboles.

**Neutral**
- Playback Comité reutiliza mapas por adapter de snapshots, sin instanciar CureGame.

## Links

- Spec: [[../spec.md]] AC-01
- SAD: [[../sad.md]] §4
