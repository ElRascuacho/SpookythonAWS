# Runbook — committee-learning

## Perfil / mantenimiento (default)

| Control | Valor v1 |
| --- | --- |
| `COMMITTEE_TRAINING_ENABLED` | `false` hasta autorización |
| Maintenance jobs | ≤ 3 jobs acotados de perfil |
| Región | `us-east-1` (stack actual) |
| Retención | 7 días DDB TTL + S3 lifecycle + logs |

## Rollout

1. Implementar T1–T16 en local con TDD (`tasks.json`).
2. Diff SAM revisado (T8); **no** `sam deploy` sin ReleaseOperator.
3. Crear tabla/bucket/worker en cuenta autorizada.
4. Correr harness de perfil (T17) con flag explícito, máx. 3 jobs.
5. Revisar duración GB-s y CloudWatch; ajustar cuotas si hace falta.
6. Solo entonces considerar `COMMITTEE_TRAINING_ENABLED=true`.

## Rollback

1. Poner `COMMITTEE_TRAINING_ENABLED=false` (o eliminar rutas committee del handler).
2. Dejar de invocar worker; slot global se libera por reconciliación/timeout.
3. No borrar evidencia S3 hasta confirmar retención; lifecycle limpia a 7 días.
4. Revertir frontend ModeShell detrás de flag si es necesario (juego sigue en InvitationGate clásico).

## Incidentes

| Síntoma | Acción |
| --- | --- |
| Slot colgado | Status/admission reconcile; no depender de TTL |
| Invoke duplicado | Claim condicional debe no-op |
| Enumeración jobId | Respuesta idéntica not_found |
| Coste inesperado | Disable training; revisar Budgets/cuotas |

## Gates externos (no los cierra el coding-agent)

- [ ] Perfil cloud real aprobado
- [ ] Crédito 140 USD: vencimiento/elegibilidad verificados
- [ ] Autorización explícita de deploy/publicación
- [ ] Crítica independiente del paquete por agente principal
