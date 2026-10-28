# Pendientes para cerrar Comité → Simulación múltiple

**Estado: parcial; no habilitar entrenamiento ni presentar una estrategia aprendida como validada.** Este documento es el handoff de la implementación local al 2026-10-28. La decisión de producto vigente es: **Comité entrena el algoritmo automático; Simulación múltiple evalúa una versión congelada frente a SGC**. La comparación con el plan manual del jugador queda fuera de este corte.

## Punto de partida verificable

- HEAD al capturar este estado: `5cc21d6`. Hay cambios de Comité **sin commitear**; también hay cambios locales de Research ajenos a este trabajo. No descartar, sobrescribir, stagear ni commitear el árbol completo sin separar propietarios.
- Implementado localmente: `src/domain/committee/offline.ts` entrena la política de cuatro pesos con el protocolo de 3552 trayectorias, promoción y auditoría final; conserva ledger compacto, procedencia y P10/P90. `scripts/train-committee.ts` produce un artefacto local **no publicado**. Una corrida real de prueba a **20 días** completó 3552 trayectorias y pasó la auditoría; no demuestra el caso objetivo de 40 días ni la viabilidad en Lambda.
- `backend/committee/policyRegistry.ts` guarda y lee versiones inmutables privadas fuera del prefijo S3 que caduca a los siete días. `GET /api/committee/policies/latest` requiere autenticación. `backend/committee/evaluation.ts` calcula internamente 128 pares de política congelada contra SGC para una versión exacta.
- Simulación múltiple puede solicitar la última versión aprobada y compararla **sin entrenar en el navegador**; usa las mismas semillas/índices y `committee-env` para cada par, e informa mejora con signo, dispersión e intervalo. Se limita al grafo normal de 16 zonas. Si no hay versión publicada, debe mostrar indisponibilidad, no una mejora inventada.
- Último chequeo reportado por los escritores: `bun test` **274/274**, `bun run build` y `bun run build:lambda` correctos. **No se repitieron en esta auditoría** después de los cambios locales posteriores. No hubo prueba AWS, despliegue ni commit de este corte.

## Bloqueos reales, en orden

| Prioridad | Falta | Condición de cierre |
| --- | --- | --- |
| 1 | Ciclo duradero de entrenamiento | `POST /api/committee/training/jobs` sigue en **503**. Conectar `CommitteeAdmissionService` antes de invocar Lambda: idempotencia, cuota, slot, claim, progreso, cancelación, terminalización y liberación única. No quitar el 503 solo por tener un worker. |
| 2 | Runtime seguro y publicación | Medir 3552 trayectorias a 40 días en el perfil real antes de habilitar `COMMITTEE_TRAINING_ENABLED`. Resolver checkpoint/reanudación o terminación honesta ante 480 s soft / 600 s hard. Publicar una versión inmutable únicamente tras auditoría final favorable; si no mejora, conservar SGC y declararlo. |
| 3 | Evaluación central e informe | `POST /api/committee/evaluations` sigue en **503**. Ejecutar en servidor la versión aprobada, no confiar en resultados enviados por el navegador; persistir cada par y un resumen privado, exponer estado `completadas/planificadas`, cancelación y descarga autenticada del informe/ledger. El GET no debe confundir trabajo pendiente con inexistente ni error S3. |
| 4 | Interfaz de Comité | Mostrar entrenamiento real y sus fases/versiones/progreso solo cuando el ciclo duradero esté conectado. El panel actual sigue siendo una vista previa; no etiquetarlo como modelo entrenado ni auditoría final. |
| 5 | Evidencia y entrega | Probar integración DynamoDB Local o AWS efímero autorizado, perfil de tiempo/memoria/costo, IAM/S3, reintentos y aislamiento por dueño. Hacer revisión independiente del diff estable; actualizar contrato OpenAPI, plan de tareas y documentación de avance (la auditoría `progress-2026-10-28.md` quedó obsoleta). Despliegue/commit solo con instrucción expresa. |

## Criterios que no se deben negociar

1. Objetivo: menor **media de contagios acumulados al día 40** bajo el mismo escenario y recursos. Informar P10/P90 aparte; no afirmar óptimo universal ni victoria por cura.
2. Una versión es inmutable durante Simulación múltiple. Las corridas usadas para entrenar una versión posterior **dejan de ser holdout** de esa versión: reservar nuevas semillas intactas para su prueba final.
3. Comparar política y SGC con pares de semilla/índice/namespace iguales. Reportar también empates y resultados peores; no truncar porcentajes negativos ni mostrar 100 % de trabajo ejecutado tras cancelación temprana.
4. Guardar todas las corridas relevantes, no solo fallos; el informe debe enlazar versión, escenario, semillas, número de corridas, progreso, diferencias pareadas, incertidumbre y veredicto de auditoría.
5. Mantener cerrados los endpoints costosos hasta demostrar admisión, recuperación y límites. El checksum del artefacto detecta corrupción; IAM y autenticación siguen siendo la frontera de confianza.

## Reanudación recomendada

1. Volver a verificar `git status`, `bun test`, `bun run build` y `bun run build:lambda`; separar los cambios de Research antes de revisar el diff de Comité.
2. Implementar **un escritor de coding a la vez**, con RED → GREEN y verificación independiente; no usar subagentes SDD. Empezar por el ciclo de admisión/worker, luego evaluación/reportes, después UI y evidencia cloud.
3. No archivar ni presentar el modo como terminado hasta que una versión de 40 días esté publicada y pueda reproducirse su informe frente a SGC. Si la prueba no demuestra mejora, el resultado correcto es **SGC sin mejora demostrada**.

## Avances desde handoff — 2026-10-28

Este apartado actualiza el estado anterior, que se conserva como **instantánea histórica**. Se agregó una base de evaluación secuencial; **no es todavía una evaluación central duradera**.

- `src/domain/committee/offline.ts`: `evaluateFrozenPolicySequential` valida el artefacto, ejecuta un par candidato/SGC por vez, espera la persistencia inyectada y consulta cancelación antes del siguiente par. Una cancelación devuelve pares completados sin resumen ni intervalo final. Al completar comparte el resumen determinista de `evaluateFrozenPolicy`. Los datos entregados al callback se copian para evitar que este altere el resumen.
- `src/domain/__tests__/sequentialCommitteeEvaluation.test.ts`: cubre orden y cantidad de callbacks, cancelación antes del primer par y entre pares, paridad, integridad, aislamiento y propagación de errores.
- Verificación posterior al cambio: pruebas focalizadas **11/11**, `bun test` **282/282**, `bun run build:lambda` correcto. `bun run build` falla por errores TypeScript en `src/domain/researchEvaluation.ts` y `src/research/ResearchWorkspace.tsx`, cambios locales ajenos a este corte. Una corrida anterior del conjunto completo falló en una prueba de Research; la corrida final pasó.
- Sin cambios en `backend/committee/evaluation.ts` ni en endpoints: `POST /api/committee/training/jobs` y `POST /api/committee/evaluations` siguen en **503**. Falta conectar admisión, worker, persistencia real por par, recuperación, estado, cancelación y reporte autenticado. No se verificaron DynamoDB/S3, AWS, perfil de 40 días, despliegue ni integración extremo a extremo.

### Avance adicional: base de almacenamiento de evaluaci�n central

- `backend/committee/evaluationStore.ts` agrega objetos S3 privados e inmutables para pares compactos y reporte compacto. Usa escritura condicional, acepta reintentos id�nticos y rechaza conflictos; vincula cada objeto al propietario, job, versi�n de registro, hash del artefacto y escenario. Un error de acceso no se interpreta como ausencia.
- `backend/__tests__/committeeEvaluationStore.test.ts` cubre reintento duplicado/conflictivo, aislamiento por prefijo de propietario, error de lectura/escritura S3 y validaci�n de progreso final. RED verificado por m�dulo inexistente; despu�s, pruebas focalizadas: 3 pasan, 0 fallan.
- `bun run build` y `bun run build:lambda`: pasan (build web con avisos de tama�o y anotaciones de dependencias).
- **Bloqueo:** esto NO conecta a�n admisi�n DynamoDB, invocaci�n as�ncrona, worker, checkpoints, progreso monot�nico, cancelaci�n, terminalizaci�n/liberaci�n, API autenticada ni permisos/variables IAM. No se prob� AWS real. La evaluaci�n y entrenamiento centrales deben seguir en 503; no se afirma funcionamiento end-to-end. Faltan pruebas del ciclo completo y fallos DynamoDB antes de habilitarlo.
- `bun test`: 288 pasan, 0 fallan (53 archivos). El aislamiento probado corresponde a claves y comprobaci�n de identidad del almac�n; la autorizaci�n HTTP independiente sigue pendiente.

### Correcci�n: reintentos con distinto orden de propiedades

- El control independiente detect� que `JSON.stringify` rechazaba pares y reportes equivalentes si sus propiedades llegaban en distinto orden. Se reprodujo en RED para ambos casos y se corrigi� mediante comparaci�n JSON can�nica con claves ordenadas recursivamente; las diferencias reales siguen rechaz�ndose.
- Verificaci�n posterior: prueba focal 3/3; `bun test` 288/288 (53 archivos); `bun run build` y `bun run build:lambda` pasan, con los avisos web ya indicados. Esta correcci�n no conecta el ciclo central ni cambia los bloqueos o el estado 503 documentados arriba; AWS real sigue sin probarse.
\

### Avance adicional: Conexión de Evaluación Central Duradera y Admisión de Entrenamiento (Prioridades 1 y 3)

- `backend/committee/evaluationExecutor.ts`: Implementa la orquestación secuencial en servidor (`evaluateFrozenPolicySequential`), vinculando `EvaluationJobService`, `CommitteeAdmissionService`, `PolicyRegistry` y `EvaluationStore`. Realiza claim atómico, consulta de cancelación entre pares, persistencia de cada par compacto en S3, avance monotónico de progreso en DynamoDB, publicación del informe final (`report.json`) y terminalización (`completed`, `cancelled` o `failed`) con liberación del slot global.
- `backend/committee/http.ts`: Conecta las rutas HTTP autenticadas con aislamiento de propietario (`ownerHash`):
  - `POST /api/committee/evaluations`: Admisión duradera con `Idempotency-Key`, verificación de versión aprobada en `PolicyRegistry`, cuota y slot global. Despacha al worker Lambda o ejecutor asíncrono devolviendo 202.
  - `GET /api/committee/evaluations/{jobId}`: Consulta de estado y progreso de pares (`completedPairs`/`plannedPairs`).
  - `DELETE /api/committee/evaluations/{jobId}`: Solicitud de cancelación cooperativa en DynamoDB.
  - `GET /api/committee/evaluations/{jobId}/report`: Descarga autenticada del informe final una vez completado (409 si sigue en curso, 404 si no existe).
  - `POST /api/committee/training/jobs`: Conectado a `CommitteeAdmissionService` para validar idempotencia y cuotas; permanece en 503 fail-closed mientras `COMMITTEE_TRAINING_ENABLED !== 'true'`.
- `backend/workerHandler.ts`: Enrutamiento de eventos `{ type: 'evaluation' }` hacia `EvaluationExecutor`.
- Pruebas y verificación:
  - `backend/__tests__/committeeEvaluationExecutor.test.ts`: 3/3 pasan (ciclo exitoso, cancelación en vuelo y aislamiento entre propietarios).
  - `backend/__tests__/committeeHttp.test.ts`: 7/7 pasan (validación de parámetros, códigos 200/202/400/401/404/409/429/503, reportes y entrenamiento duradero).
  - `backend/__tests__/workerHandler.test.ts`: 2/2 pasan.
  - Estado completo: `bun test` **316/316 pasan** (58 archivos), `bun run build:lambda` y `bun run build` exitosos.
