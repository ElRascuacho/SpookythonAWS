# Benchmark local exploratorio — 2026-10-28

El plan [benchmark-plan-v1.json](benchmark-plan-v1.json) fijó dos escenarios sintéticos y 128 índices nuevos por escenario antes de ejecutar **esta comparación**. Los dos tipos de escenario ya aparecían en la [investigación anterior](raw/REPORT.md): esto es una **replicación con semillas nuevas**, NO una prueba de generalización a escenarios inéditos ni un plan fijado antes de seleccionar la política. El reporte íntegro, con los cuatro resultados por par, manifiesto, hashes de entradas y perfil local, está en [local-benchmark-2026-10-28.json](local-benchmark-2026-10-28.json).

| Escenario | Mejora media frente a SGC (contagios acumulados) | Intervalo bootstrap pareado 95 % | Pares donde empeoró |
| --- | ---: | ---: | ---: |
| Standard, semillas nuevas | +21 845,68 | [21 686,69; 22 018,87] | 0/128 |
| Transmisión duplicada y mitad de dosis | +1 573,26 | [1 475,52; 1 669,16] | 0/128 |

La media de las dos mejoras, con **igual peso por escenario**, fue +11 709,47. No se calculó un intervalo para ese agregado: dos escenarios no permiten afirmar generalización. La comparación incluyó SGC exacto, RANDOM y NO_INTERVENTION con la misma semilla e índice ambiental por par.

**Límites:** son resultados del simulador, no una estimación de efecto epidemiológico real. La selección anterior ya vio ambos tipos de escenario, de modo que la incertidumbre bootstrap solo describe variación entre estas réplicas; no elimina sesgo de selección entre escenarios. El árbol de código estaba modificado (`dcf7a0d`, `dirty=true`), por lo que el reporte es evidencia local exploratoria, no un certificado de promoción. El perfil midió Bun/x64 local durante 13,36 s; `awsCostUsd` es `null` porque no se ejecutó Lambda ARM ni AWS. Antes de habilitar el entrenamiento siguen pendientes una evaluación más amplia y predefinida, la revisión del código y el perfil cloud autorizado.
