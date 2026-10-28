# Benchmark local en escenarios sintéticos nuevos — 2026-10-28

Se escribió [benchmark-unseen-plan-v1.json](benchmark-unseen-plan-v1.json) **antes de ejecutar este benchmark** (`SHA-256 db63796387407232b6c785a7a29f718af16b677064b99598c9c51c71f9c0e056`). Frente a los dos tipos de escenario de la investigación archivada, este plan modifica por separado la presión vectorial, la capacidad hospitalaria y el presupuesto diario. La política candidata ya estaba congelada en [local-registered-policy.json](raw/local-registered-policy.json); no se ajustó con estos resultados. Cada escenario usa una semilla nueva y 128 índices ambientales nuevos, compartidos por candidato, SGC, RANDOM y NO_INTERVENTION. Los datos por par y la procedencia están en [local-unseen-benchmark-2026-10-28.json](local-unseen-benchmark-2026-10-28.json).

| Escenario | Mejora media vs. SGC (contagios acumulados) | Intervalo bootstrap pareado 95 % | Pares donde empeoró |
| --- | ---: | ---: | ---: |
| Mayor presión vectorial | +19 243,67 | [19 092,67; 19 391,39] | 0/128 |
| Menor capacidad hospitalaria | +23 147,70 | [22 997,08; 23 303,01] | 0/128 |
| Menor presupuesto diario | +28 611,69 | [28 515,76; 28 706,63] | 0/128 |

La media con igual peso por escenario fue +23 667,69; el peor escenario de este conjunto tuvo +19 243,67. **No se estimó un intervalo para el agregado** y tres escenarios elegidos manualmente no representan una distribución de situaciones reales. Estos resultados solo prueban comportamiento en el simulador actual. El plan y el reporte todavía no están comprometidos en Git; el reporte registra `dirty=true`, por lo que no son una preinscripción externa ni una certificación de publicación. El perfil fue local Bun/x64 (27,64 s); no mide duración/costo de Lambda ARM ni valida la epidemiología real.
