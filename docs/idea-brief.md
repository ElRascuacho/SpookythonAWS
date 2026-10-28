---
status: Draft
owner: "unassigned"
updated_at: "2026-10-27"
depth: medium
---

# Idea brief — aprendizaje-hibrido-de-estrategias

## 1. Raw idea

Quiero que el modelo aprenda de sus propias simulaciones, que haga miles de simulaciones y encuentre la mejor estrategía para ese escenario, y que se vaya afinando la estrategía, quiero algo así, mi idea es presentar un motor que promete dar una estrategía alcanzada por aprendizaje y que de la mejor decisión

## 2. Problem

**owner-reported:** se busca presentar un motor que mejore sus estrategias mediante resultados de simulaciones y recomiende una decisión adecuada al escenario, en lugar de limitarse a repetir una estrategia fija.

**source-verified:** el comparador actual repite tres estrategias predefinidas; repetir corridas permite estimarlas, pero ese flujo no busca ni actualiza estrategias entre ejecuciones (evidencia E1).

El resultado deseado es una estrategia encontrada y validada con evidencia comparativa. **owner-reported:** se aceptaron una experiencia progresiva, 40 días de evaluación por defecto y el objetivo principal de reducir la media de contagios acumulados entre réplicas al cierre de ese horizonte, comparando bajo el mismo escenario y presupuesto. Se informará también la dispersión, sin convertir el peor caso en objetivo principal ni afirmar prevención de por vida. **unknown:** siguen pendientes la evidencia necesaria para promover mejoras y el límite de latencia de la primera recomendación.

## 3. Users

**owner-reported:** el equipo que presentará el motor necesita explicar de dónde surge la recomendación y cómo se comprueba su mejora.

**assumption:** una persona operadora configurará el escenario y solicitará una recomendación. **unknown:** usuario final, contexto de uso y responsable de operación; no se confirmó un uso clínico ni una autoridad real como destinataria.

## 4. Why now

**owner-reported:** el disparador es la intención de presentar un motor que aprenda, expresada en la idea original. No se acordó una fecha de entrega para esta evolución; no se infiere urgencia adicional del calendario de otras entregas.

La entrevista continúa: se aceptaron la experiencia progresiva, el presupuesto inicial del piloto de **5 USD/mes para cómputo de aprendizaje en AWS**, menos contagios en promedio, un modo Comité separado que conserve el juego y la campaña de cura, **40 días de evaluación por defecto** y la **ejecución automática con visualización dentro de la simulación**. **owner-reported:** el usuario informó disponer de **140 USD de crédito AWS**; no se verificaron saldo, vencimiento ni servicios elegibles. Ese saldo no autoriza gastarlo íntegramente. Hay intención suficiente para pasar a definir evidencia técnica acotada, sin una nueva pregunta al usuario en este momento. El límite exacto de latencia se medirá y acordará posteriormente.

## 5. Out of scope

**Restricción de esta etapa:** no implementar código, desplegar infraestructura, elegir un algoritmo ni redactar una especificación detallada. La creación de ajustes del proceso queda diferida al cierre autorizado de la entrevista.

**Límite de producto aceptado:** no reemplazar el juego principal ni modificar la condición de victoria por cura o la campaña existente. El motor de apoyo a decisiones se agregará como otro modo, Comité, con su propio objetivo de menor media de contagios acumulados.

**Alcance de la ejecución automática:** aplicar la estrategia y visualizar sus acciones y resultados diarios dentro de la simulación del Comité, sin aprobación manual por día. No automatiza intervenciones reales; el juego manual y la campaña permanecen separados.

**Propuesta de límite pendiente de cierre:** no prometer un óptimo global ni validez epidemiológica real. El simulador actual es educativo y no calibrado (E2); mejorar dentro de él no demuestra utilidad clínica.

## 6. Risks

La hipótesis más débil es que afinar estrategias con simulaciones produzca una mejora que también aparezca en semillas no utilizadas durante el aprendizaje. Sobreajuste y costo excesivo son riesgos previstos, no incidentes observados. La aceptación del enfoque no prueba que esa hipótesis sea cierta.

| Evidencia | Clase | Origen | Hallazgo o límite |
| --- | --- | --- | --- |
| E1: comportamiento existente | source-verified | `src/domain/monteCarlo.ts:48–82`, revisión `4ef9a98`, inspeccionada el 2026-10-27 | Repite estrategias fijas; ese comparador no implementa aprendizaje entre corridas. |
| E2: alcance del modelo | source-verified | `README.md:65–70`, revisión `4ef9a98`, inspeccionada el 2026-10-27 | Modelo educativo, datos de escenario no calibrados y repetición de calendario manual, no política adaptativa aprendida. |
| E3: dirección híbrida | owner-reported | Aceptación del usuario: «Si, me gusta» | Conservar estrategias aprendidas como puntos de partida, optimizar para cada escenario y validar con semillas no vistas antes de promover una mejora. Es una decisión aceptada, no evidencia experimental. |
| E4: mejora generalizable | unknown | Sin experimento ejecutado para esta idea | La media de contagios acumulados y el horizonte por defecto de 40 días ya fueron elegidos; faltan umbral de mejora y evidencia independiente necesaria para promover una candidata. |
| E5: viabilidad operativa | unknown | Presupuesto inicial acordado; cumplimiento aún no medido | Falta medir cómputo real en AWS y diseñar cuotas conservadoras y reglas de parada para el objetivo de 5 USD/mes; no hay cantidad de corridas ni latencia garantizadas. |
| E6: experiencia progresiva | owner-reported | Aceptación del usuario: «Si, esa quiero» | Ofrecer primero una estrategia validada, continuar buscando bajo límites de tiempo y costo y publicar actualizaciones solo cuando se demuestre mejora. No implica aprendizaje desatendido permanente ni garantía de mejora real monótona. |
| E7: crédito AWS informado | owner-reported | Usuario: «Tengo140», en la conversación sobre crédito AWS en USD | Saldo declarado de 140 USD, sin verificación independiente. Vencimiento y servicios elegibles desconocidos. El saldo por sí solo no es autorización de gasto; la aceptación mensual posterior se registra en E8. |
| E8: presupuesto inicial aceptado | owner-reported | Usuario: «Si,tomemoseso», ante la propuesta de 5 USD/mes | Objetivo de diseño de 5 USD/mes para el piloto de cómputo de aprendizaje. No es un techo duro de facturación AWS, no se modificaron ajustes de cuenta o pagos y faltan mediciones reales para diseñar cuotas y paradas conservadoras. |
| E9: objetivo de riesgo elegido | owner-reported | Usuario: «Priorizar menos contagios en promedio» | Priorizar menor media de contagios acumulados entre réplicas bajo escenario, horizonte y presupuesto comunes. Informar dispersión de forma transparente; no optimizar principalmente el peor brote. El horizonte por defecto se confirmó posteriormente en E12; las reglas de promoción siguen pendientes. |
| E10: separación de modos aceptada | owner-reported | Usuario: «Quiero conservar el juego y agregar este comité como otro modo» | Agregar un modo Comité separado; conservar el juego, la campaña y la victoria por cura. El nuevo modo optimizará la media de contagios acumulados. |
| E11: crítica independiente de entrevista | assumption | Crítica completada sobre el borrador y el traspaso de evidencia de fuentes; sin nueva inspección independiente de código | Tres hallazgos: el conteo acumulado y un horizonte corto podrían premiar solo aplazar contagios; reutilizar reiteradamente semillas de validación no equivale a una prueba final intacta; la frontera entre modos necesitaba decisión del usuario, ahora resuelta por E10. Son riesgos o decisiones, no bugs observados. |
| E12: horizonte por defecto aceptado | owner-reported | Usuario: «40 días por defecto» | Evaluar por defecto la media de contagios acumulados al día 40 bajo condiciones comunes. Se resuelve la elección del horizonte inicial, no se demuestra prevención más allá del corte ni se promete simular hasta el fin del brote. El rango ajustable sigue sin elegirse como detalle de diseño. |
| E13: interacción del Comité aceptada | owner-reported | Usuario: «Ejecución automática con visualización» | El modo Comité ejecutará automáticamente la estrategia dentro de la simulación y mostrará acciones y resultados diarios; no requiere aprobación humana en cada día simulado. No implica automatización del mundo real ni reemplaza el juego manual o la campaña. |

La crítica independiente de entrevista está completada e incorporada en E11; no fue una revisión de código ni aportó una nueva inspección independiente de fuentes. La elección del horizonte inicial queda resuelta con 40 días por defecto; debe declararse su alcance finito para no confundir aplazamiento con prevención posterior al día 40. Quedan por verificar la semántica del conteo y acordar una regla de reutilización de conjuntos de semillas que preserve una prueba final no utilizada para elegir candidatas. La frontera de producto ya fue resuelta: modo Comité separado, sin reemplazar el juego. La conservación o sustitución de estrategias requerirá responsables y reglas de reversión todavía no acordados.

## 7. Recommendation

**Dirección aceptada por el usuario:** enfoque híbrido; reutilizar lo aprendido como punto de partida y afinar por escenario. Una candidata solo se promovería después de validarla en semillas no vistas. Presentarla como la mejor estrategia encontrada y validada dentro del alcance evaluado, no como un óptimo global demostrado.

**Experiencia progresiva aceptada:** entregar una primera estrategia validada y continuar buscando mejoras mientras lo permitan los límites de tiempo y costo acordados. Publicar una actualización solo si la validación demuestra mejora; en caso contrario, conservar la estrategia validada anterior. No se acordaron ejecución desatendida permanente, latencia concreta, volumen por segundo ni garantía de mejora del rendimiento real en cada actualización.

**Presupuesto inicial aceptado:** objetivo de diseño de 5 USD/mes para cómputo de aprendizaje del piloto. Traducirlo a cuotas conservadoras y reglas de parada de la aplicación después de medir el costo real en AWS; no se ha elegido una cantidad concreta de corridas, algoritmo o infraestructura. Este acuerdo no crea un límite duro de factura ni modifica presupuestos, pagos o recursos de la cuenta.

**Objetivo principal aceptado:** minimizar la media de contagios acumulados entre réplicas **al día 40 por defecto**, para un escenario y presupuesto comunes. Mostrar también la dispersión y los resultados desfavorables; elegir la media no garantiza protección ante todos los brotes. Quedan por acordar la magnitud y evidencia de mejora para promover candidatas; no se ha elegido algoritmo.

**Alcance aceptado:** conservar el juego y la campaña de cura, incluida su condición de victoria, y agregar Comité como otro modo de apoyo a decisiones. El objetivo del Comité no sustituye las reglas del juego existente.

**Interacción aceptada:** Comité ejecuta automáticamente la estrategia recomendada dentro de la simulación, con visualización de acciones y resultados diarios. No exige que la persona aplique una recomendación por día; tampoco autoriza acciones automáticas fuera del simulador.

**Horizonte inicial aceptado:** 40 días por defecto, sin promesa de evaluar hasta que termine el brote ni de prevenir contagios posteriores. No se afirma que 40 días sea un horizonte epidemiológicamente calibrado. Se había propuesto hacerlo configurable; el rango ajustable continúa como detalle de diseño no elegido. Antes de promover resultados deben verificarse el conteo y la separación de semillas de búsqueda, validación y prueba final; los informes deben explicitar que comparan el resultado al cierre de un horizonte finito.

El beneficio esperado es reutilizar experiencia sin asumir que una estrategia sirve para cualquier escenario. La contrapartida es necesitar evidencia adicional para distinguir mejora de sobreajuste, además de límites de tiempo y costo.

**Alternativa más simple:** mantener la estrategia fija y comparar más corridas; permite estimar resultados, pero no satisface la intención de aprender. No se registra un rechazo definitivo de esta alternativa.

Outcome: needs-evidence

La entrevista sigue abierta y no está lista para especificación. Por ahora no hace falta otra pregunta de intención al usuario. **Próxima acción de evidencia:** definir un experimento técnico acotado que compare un enfoque candidato capaz de aprender con SGC bajo el mismo escenario, presupuesto y horizonte de 40 días, reserve semillas finales no utilizadas para seleccionar candidatas y mida mejora y viabilidad. Esto no elige un algoritmo ni constituye una implementación nueva. Deben resolverse la evidencia de promoción y reutilización de semillas, el conteo y su comunicación al horizonte finito, la latencia y las cuotas/reglas de parada compatibles con el presupuesto aceptado. La creación de ajustes y el cierre final de la entrevista quedan diferidos hasta resolver esa evidencia; no se han ejecutado cambios en AWS.

## 8. Open questions

| Incógnita | Consecuencia | Estado | Acción de verificación | Responsable |
| --- | --- | --- | --- | --- |
| Viabilidad de un enfoque candidato que aprenda frente a SGC | La intención del producto está suficientemente delimitada, pero falta evidencia para elegir una solución o pasar a especificación. | blocking; siguiente acción de evidencia | Definir un experimento acotado con comparación justa, semillas finales intactas y mediciones de mejora, tiempo y consumo; no seleccionar algoritmo ni implementar todavía. | Sin asignar |
| Rango ajustable del horizonte | El valor por defecto de 40 días está aceptado, pero aún no se acordó qué otros valores se ofrecerían. | nonblocking para continuar la entrevista; detalle de diseño pendiente | Definir si se habilitará el ajuste y sus límites sin reabrir el valor por defecto aceptado ni prometer resultados más allá del horizonte elegido. | Sin asignar |
| Cumplimiento operativo del objetivo de 5 USD/mes | El importe está aceptado, pero no asegura por sí solo evitar sobrecostos. | blocking antes de ejecutar aprendizaje en AWS | Medir consumo real y diseñar cuotas conservadoras y reglas de parada de la aplicación, sin asumir un techo duro de facturación ni fijar corridas sin evidencia. | Sin asignar |
| Vencimiento y servicios elegibles del crédito AWS informado | El saldo puede no cubrir todo el uso previsto o vencer antes de consumirlo. | blocking antes de depender de créditos para gasto operativo | Verificar condiciones del crédito mediante evidencia autorizada de la cuenta; no tratar el saldo informado como cobertura garantizada. | Sin asignar |
| Límite exacto de latencia hasta la primera estrategia validada | La experiencia progresiva está aceptada, pero falta un límite verificable de espera. | blocking para cerrar criterios de aceptación | Medir alternativas bajo el presupuesto acordado y convenir un límite concreto; no reabrir la elección de experiencia progresiva. | Sin asignar |
| Conteo acumulado, umbral y evidencia de promoción | Sin verificar qué cuenta el resultado y cómo afecta el corte temporal, una mejora aparente podría no expresar el objetivo acordado. | blocking | Verificar semántica de conteo y aplazamiento; acordar criterio de mejora y evidencia comparativa bajo un horizonte común. | Sin asignar |
| Regla de reutilización de semillas y prueba final | Elegir repetidamente candidatas con la misma validación puede contaminar una supuesta prueba independiente. | blocking antes de promover estrategias | Acordar separación y reutilización de conjuntos de búsqueda/validación, manteniendo una prueba final no utilizada para seleccionar candidatas. | Sin asignar |
| Algoritmo y evidencia de mejora en semillas no vistas | No se conoce qué método cumple los criterios sin sobreajuste. | blocking para elegir implementación | Tras cerrar restricciones, comparar candidatos mediante un experimento acotado, aún no diseñado ni ejecutado. | Sin asignar |
| Operación y reversión de estrategias promovidas | Falta quién responda ante una recomendación degradada. | blocking antes de uso operativo | Identificar responsable y acordar cuándo conservar o retirar una estrategia. | Sin asignar |
