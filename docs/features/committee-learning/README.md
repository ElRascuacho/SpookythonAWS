# Feature package — committee-learning

Plan de producto y arquitectura para el **modo Comité**: búsqueda privada y acotada de políticas explicables que minimizan la media de contagios acumulados a horizonte finito, sin reemplazar el juego ni la campaña de cura.

## Estado

| Artefacto | Estado |
| --- | --- |
| Brief / producto | Aceptado en [`docs/idea-brief.md`](../../idea-brief.md) — no reabrir entrevista |
| Spec | [`spec.md`](./spec.md) — Draft, US-01..06 / AC-01..16 |
| Arquitectura | [`sad.md`](./sad.md) + [`adr/`](./adr/) |
| Algoritmo | [`algorithm.md`](./algorithm.md) |
| Datos | [`data-model.md`](./data-model.md) |
| Contratos | [`contracts/`](./contracts/) |
| UX | [`ux-flows.md`](./ux-flows.md), [`screens.md`](./screens.md) |
| Pruebas | [`test-plan.md`](./test-plan.md) |
| Tareas | [`tasks.json`](./tasks.json), [`tasks/`](./tasks/) |
| Evidencia | [`evidence/experiment.md`](./evidence/experiment.md) |
| Handoff | [`CONTINUE-HERE.md`](./CONTINUE-HERE.md) |
| Runbook | [`runbook.md`](./runbook.md) |

**No implementar** hasta que el paquete pase crítica independiente del agente principal y exista autorización explícita de despliegue/entrenamiento.

## Lectura rápida

1. [`CONTINUE-HERE.md`](./CONTINUE-HERE.md) — límites, evidencia y checklist.
2. [`spec.md`](./spec.md) + [`CONTEXT.md`](./CONTEXT.md) — qué entregar.
3. [`sad.md`](./sad.md) + ADRs — cómo encaja en el brownfield.
4. [`tasks.json`](./tasks.json) — orden TDD para el agente de coding.

## Prompt CODING-ONLY (copiar al agente implementador)

```text
Implementa SOLO las tareas de docs/features/committee-learning/tasks.json en orden topológico.
Reglas:
- TDD: rojo → verde → refactor por tarea. No saltes DoD.
- Ante contradicción entre código brownfield y el paquete: STOP y reporta bloqueado. No rediseñes.
- No despliegues AWS, no habilites entrenamiento, no gastes crédito, no hagas commit/push salvo petición explícita del operador.
- No inventes cuotas, pools, semillas ni hashes. Usa algorithm.md, data-model.md y contracts/openapi.yaml.
- Conserva el juego/campaña; ModeShell no debe desmontar App al alternar modos.
- Paridad numérica del motor con las llamadas existentes de runSingleSeirSimulation debe permanecer idéntica: el quinto argumento puede ser el grafo o `options`; si se pasa un grafo, `options` ocupa el sexto argumento.
- Auth: cookie manta_session vigente; ownerHash derivado del nonce de sesión, no del codeHash compartido.
- Resultados en S3 privado; nunca URLs públicas ni signed URLs de larga vida en v1.
- Perfil cloud real es gate externo; no inventes timings/costes.
Si una tarea no puede cerrarse en verde: marca blocked con causa y pasa a la siguiente no dependiente.
```

## Restricciones operativas

- Un solo escritor en el árbol salvo worktrees autorizados.
- Documentación técnica nueva en español; identificadores/tipos/esquemas en inglés.
- No alterar la cita original de `docs/idea-brief.md` §1 Raw idea.
- Settings locales: `.claude/sdd.local.md` (gitignore); `auto_commit: off`.
