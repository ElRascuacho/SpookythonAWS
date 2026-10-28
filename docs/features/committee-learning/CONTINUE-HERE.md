# Continuación: paquete de planificación LISTO PARA CRÍTICA — aún NO implementar

> Plan documental completado en continuación Orca (2026-10-27). **No iniciar implementación de aplicación** hasta crítica independiente del agente principal + (si aplica) autorización de deploy. Open questions de producto ya cerrados en brief; gates restantes son externos.

## Estado y límites

- Fuente de verdad brownfield: HEAD `4bcdc6e251c4ad02c350a15e35e3af1bb5e0ab5d`. Verificar Git antes de codear; no descartar trabajo ajeno.
- Solo documentación en `docs/features/committee-learning/` (+ enlace README raíz + `.gitignore` SDD). Sin código Comité, sin AWS, sin commit/push en esta fase.
- `auto_commit: off` en `.claude/sdd.local.md` (gitignore). Usuario prohíbe OpenCode; un escritor.
- Docs técnicas en español; identificadores en inglés. No alterar cita original de `docs/idea-brief.md` §1.
- Corrección brownfield: **ModeShell aún no existe** en `src/`; `InvitationGate` desmonta `App` hoy. ADR-0007 prescribe montar/ocultar.
- Cookie viva: `manta_session` (no confundir con `spk_session` del stack demo no cableado a UI).

## Inventario

| Artefacto | Path |
| --- | --- |
| Entrada | [README.md](./README.md) |
| Spec | [spec.md](./spec.md) Draft US01–06 AC01–16 |
| Glosario | [CONTEXT.md](./CONTEXT.md) |
| SAD Arc42 | [sad.md](./sad.md) |
| ADRs Accepted | [adr/0001](./adr/0001-run-learning-in-dedicated-async-worker-lambda.md) … [0011](./adr/0011-extend-simulator-with-optional-fifth-options-argument.md) |
| Algoritmo | [algorithm.md](./algorithm.md) |
| Datos | [data-model.md](./data-model.md), [migrations/](./migrations/) |
| API | [contracts/openapi.yaml](./contracts/openapi.yaml), [events.md](./contracts/events.md) |
| UX | [ux-flows.md](./ux-flows.md), [screens.md](./screens.md) |
| Tests | [test-plan.md](./test-plan.md) |
| Tareas | [tasks.json](./tasks.json) (18), [tasks/](./tasks/) |
| Runbook | [runbook.md](./runbook.md) |
| Evidencia | [evidence/experiment.md](./evidence/experiment.md) + raw/templates |
| Audit | [_audit/planning-2026-10-27.md](./_audit/planning-2026-10-27.md) |

## Evidencia (resumen)

Investigación local Bun x64: empate estándar; −3,018177% en escenario alterado (128 finales). 4515 llamadas totales; no convertir a coste Lambda. Protocolo producto (3552 + promoción progresiva) ≠ protocolo ya ensayado. Reproducción manual vía templates → `.git/committee-experiment/` (no auto-run en docs).

## Producto aceptado (no reabrir)

Juego/campaña intactos; Comité separado; auto dentro de simulación + visualización; media contagios a 40 días default (UI 20–60 supuesto arquitecto); híbrido + progresivo; sin LLM/GPU obligatorios; USD5/mes objetivo de diseño; crédito 140 informado no verificado.

## Arquitectura bloqueada (resumen)

API delgada autenticada + worker Node22 ARM 2048MB/600s; DDB CommitteeTable + S3 resultados privado; admisión atómica + slot 1; ownerHash de nonce; RNG env independiente de política; CEM 4 pesos; library ≤8; training off hasta perfil.

## Próximo agente — dos caminos

### A) Crítica / cierre de plan (recomendado ahora)

1. Releer README + spec + sad + algorithm + tasks.json.
2. Crítica limpia: contradicciones, AC sin tarea, OpenAPI vs data-model, riesgos auth.
3. Opcional: `spectral` / validar Mermaid; verificar hashes `evidence/archive-checks.json`.
4. No codear.

### B) Coding-only (solo tras OK de crítica + instrucción explícita del usuario)

1. Prompt CODING-ONLY en [README.md](./README.md).
2. Ejecutar `tasks.json` T1→T18 en orden topológico, TDD.
3. Ante contradicción: STOP/blocked — no rediseñar.
4. Sin deploy/training/commit salvo petición explícita.

## Comprobaciones pendientes

- [ ] Crítica independiente del paquete completo
- [ ] Perfil cloud real / cuotas / crédito
- [ ] Autorización release
- [ ] (Opcional) Actualizar readiness del brief solo cuando ingeniería+gates lo permitan — conservar 8 headings y cita §1
