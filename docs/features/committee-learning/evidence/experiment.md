# Evidencia del experimento de factibilidad — committee-learning

> Investigación local archivada. **No** es una feature implementada ni un coste cloud medido.

## Resultado en una frase

En 128 réplicas finales intactas: **empate con SGC** en el escenario estándar; **−3,018177%** de media de contagios vs SGC en el escenario de doble transmisión y mitad de vacunas. La evidencia respalda una familia acotada con promoción honesta ante empate/fallo, no una promesa de mejora universal.

## Provenance

| Campo | Valor |
| --- | --- |
| Revisión fuente | `4bcdc6e251c4ad02c350a15e35e3af1bb5e0ab5d` |
| Runtime local | Bun `1.3.14`, Windows x64 |
| Wall search/validation/final | 107,4908002 s |
| Llamadas simulador | 4515 totales = 4480 búsqueda/validación/final + 21 paridad + 14 suplementarias |
| Campo legado `results.json.totalTrajectories` | `4483` (no reescribir; ver `raw/checks.json`) |

Archivos crudos inmutables (SHA256 verificados en `archive-checks.json`):

- [`raw/REPORT.md`](./raw/REPORT.md)
- [`raw/results.json`](./raw/results.json)
- [`raw/checks.json`](./raw/checks.json)
- [`raw/provenance.json`](./raw/provenance.json)
- [`raw/frozen-standard.json`](./raw/frozen-standard.json)
- [`raw/frozen-double-transmission-half-vaccines.json`](./raw/frozen-double-transmission-half-vaccines.json)

Plantillas de reproducción (copiar a `.git/committee-experiment/` quitando `.txt`):

- [`templates/run-experiment.ts.txt`](./templates/run-experiment.ts.txt)
- [`templates/check-frozen.ts.txt`](./templates/check-frozen.ts.txt)
- [`templates/adapted-engine.ts.txt`](./templates/adapted-engine.ts.txt)
- [`templates/weighted-policy.ts.txt`](./templates/weighted-policy.ts.txt)

## Escenarios y protocolo investigado

Ambos: 16 nodos, 40 días, USD 7.500/día, eficacia 0,85, semilla base `20261030`, origen N01, 35 I + 50 E.

| Escenario | betaHuman | dosis/lote | Media candidata | Media SGC | Reducción |
| --- | ---: | ---: | ---: | ---: | ---: |
| Estándar | 0,3 | 850 | 164576,5625 | 164576,5625 | 0% (empate) |
| Alterado | 0,6 | 425 | 239930,453125 | 247397,34375 | 3,018177% |

Pools investigados (no idénticos al protocolo de producto): train 0–7, validation 1000–1023, final 100000–100127. Familia: 4 log-multiplicadores cordón/fumigación early/late ∈ [−3,3]; vector 0 = SGC exacto. RNG ambiental compartido con namespace `SMART_CORTAFUEGOS` para candidatas y SGC.

## Límites explícitos

- No es Node 20/22 ARM Lambda ni factura AWS.
- El protocolo de producto (promoción progresiva + auditoría final, presupuesto 3552) **no** es el mismo ensayo ya corrido; no afirmar «validado experimentalmente» el control progresivo nuevo.
- Empate debe conservar incumbente; no promocionar por desempate de pesos no nulos con acciones idénticas a SGC.
- Sin LLM/GPU; sin optimalidad global; sin validez clínica.

## Reproducción (manual, no automática en fase documental)

```powershell
# Desde la raíz del repo, tras copiar plantillas a .git/committee-experiment/
bun --no-env-file run .git/committee-experiment/run-experiment.ts
bun --no-env-file run .git/committee-experiment/check-frozen.ts
```

Verificar primero hashes de `provenance.json` contra HEAD. Reejecutar sobrescribe scratch, nunca `evidence/raw/`.
