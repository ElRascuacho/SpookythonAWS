---
status: Draft
owner: "Tech Lead"
updated_at: "2026-10-27"
feature_size: L
---

# UX flows — committee-learning

## Platform

SPA existente tras `InvitationGate`. ModeShell añade pestañas/segmentos: **Juego** | **Campaña** | **Comité**.

## Flow F1 — Abrir Comité sin perder partida

1. CommitteeOperator está en Juego con estado en memoria.
2. Cambia a Comité.
3. Ve formulario de escenario; al volver a Juego, la partida sigue.

## Flow F2 — Solicitar búsqueda y ver baseline

1. Completa escenario válido (horizonte 20–60, default 40).
2. Inicia búsqueda → ve `queued`/`running`.
3. Antes de cualquier mejora, ve baseline identificada como no aprendida (SGC u otra base etiquetada).
4. Polling 2 s visible / 10 s oculto; `stateRevision` no retrocede.

## Flow F3 — Mejora progresiva vs auditoría final

1. Si hay ProgressVersion, UI la etiqueta «provisional validada».
2. Al terminar, si FinalAudit falla → recomendación vuelve a base; historial progresivo visible pero no «aprobación final».
3. Si pasa → recomendación aprendida + medios/dispersión.

## Flow F4 — Playback diario

1. Elige versión de política disponible.
2. Recorre días 0..H; mapa muestra `DailyCitySnapshot.action` vía adapters existentes.
3. No requiere CureGame.

## Flow F5 — Cancelar / fallos

1. Cancelar marca `cancelRequested`; UI muestra última ProgressVersion si existe y `finalAudit=not-run`.
2. Errores de cuota/slot/disabled explican siguiente acción sin jerga interna de AWS.

## Screen inventory (refs)

Ver `screens.md` SCR-01..SCR-06.
