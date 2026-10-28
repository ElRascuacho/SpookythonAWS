# Spec propuesta — Laboratorio conversacional de intervenciones

Estado: borrador actualizado con el alcance de Mateo; pendiente de cerrar decisiones de producto y contrato compartido. No autoriza implementación cloud ni despliegue.
Rama: `implementacion-ajustes-de-variables`.
Referencia de integración revisada: `main` en `b53b52b`; el paquete Comité es planificación, no funcionalidad implementada.

Referencias de diseño:
- [Espacio de investigación: alcance, características y decisiones ABCD](features/research-workspace/README.md). Nueva dirección de producto: sección investigativa diferenciada del juego, sin minijuegos y con motor de infección compartido. Las propuestas previas de ubicación en Comité se revisarán según esas decisiones.
- [Spec Comité](features/committee-learning/spec.md).
- [Arquitectura Comité](features/committee-learning/sad.md).
- [Extensión prevista del motor — ADR-0011](features/committee-learning/adr/0011-extend-simulator-with-optional-fifth-options-argument.md).
- [Contrato API Comité](features/committee-learning/contracts/openapi.yaml).
- [Adaptadores de reproducción — T15](features/committee-learning/tasks/t15-playback.md).

## 1. Intención confirmada y decisiones pendientes

El usuario quiere crear medidas mediante conversación con un agente, sin un catálogo cerrado de medidas. El agente debe crear parámetros editables en un menú dinámico y conectar su comportamiento con el motor. Ejemplo confirmado: toque de queda con horario configurable. Se busca una demostración convincente para el jurado.

Decisiones confirmadas posteriormente:
- Crear medidas combinando capacidades soportadas; declarar cuándo es necesario ampliar el motor.
- Aceptar una aproximación diaria de los horarios para la primera versión, con su limitación visible.
- No mostrar ni implementar aquí el sistema de miles de simulaciones: Mateo trabaja esa área. Esta spec define solo el contrato de integración que debe acordarse con él.
- No limitar la creación a tres medidas ni exigir escoger un catálogo. Los ejemplos son pruebas, no restricciones de producto.

Las demás decisiones de arquitectura son recomendaciones. Los acuerdos del brief existente sobre evaluación masiva y presupuesto son contexto para coordinar con Mateo, no autorización para construir su área ni garantías de la integración.

### 1.1 Alcance y responsabilidades

| Área | Nuestra entrega | Dependencia / fuera de alcance |
| --- | --- | --- |
| Conversación | Crear y modificar medidas y parámetros existentes mediante lenguaje natural; aclarar ambigüedades | No conceder permisos ni aceptar supuestos silenciosamente. |
| Panel dinámico | Generar controles desde definiciones; edición sincronizada con conversación | No crear pantallas específicas por nombre de medida. |
| Semántica | Compilar condiciones, horarios aproximados, ámbitos, efectos y costos | Fenómenos no soportados exigen ampliación explícita del motor. |
| Persistencia | Definiciones, instancias, versiones y conversación según permisos por acordar | Separada de la biblioteca global de pesos de Mateo. |
| Motor compartido | Especificar y probar el intérprete de efectos y su traza | Cambios al seam y presupuesto se coordinan con Mateo; no crear un motor alternativo. |
| Evaluación | Exportar configuración reproducible mediante contrato acordado | Mateo: búsquedas, workers, auditoría, cuotas y UI de simulaciones masivas. |
| Visualización | Controles, diferencias y efectos por zona/día en adaptadores compartidos | No mostrar aquí progreso de miles de simulaciones ni mejoras no evaluadas. |

El agente distingue entre cambiar un parámetro del escenario y crear una intervención. Puede asistir en ambas operaciones, pero no cambiar las condiciones del escenario para atribuir falsamente una mejora a una medida. En la primera entrega, las intervenciones solo actúan mediante capacidades declaradas; no agregan compartimentos o ecuaciones nuevas por generación de código.

### 1.2 Condición de éxito

Una petición nueva, expresable con las capacidades disponibles, debe producir una definición válida, controles editables y un efecto trazable sin añadir código específico para su nombre. El ciclo debe funcionar también al modificar la medida por chat o formulario. La integración completa exige ejecución real en el motor compartido; una previsualización de factores por sí sola no satisface esa condición.

## 2. Evidencia del repositorio

- `src/domain/seirEngine.ts`: motor diario, estados SEIR-V, movilidad entre nodos, intervenciones y semillas reproducibles. No representa movilidad intradiaria observada ni agentes individuales.
- `src/domain/types.ts` y `src/domain/schemas/simulationParams.schema.ts`: catálogo fijo de parámetros. El esquema estricto no admite propiedades nuevas arbitrarias.
- `src/components/SurpriseOutbreakPanel.tsx`: controles específicos escritos manualmente. No es un generador de formularios.
- `src/domain/monteCarlo.ts`: bucles secuenciales para tres estrategias, hasta 500 réplicas por estrategia. No implementa búsqueda.
- `backend/ai/bedrockPolicyGenerator.ts`: política JSON generada mediante Bedrock; no incorpora resultados experimentales para mejorar candidatas.
- `backend/ai/policyInterpreter.ts`: intérprete de política existente, aprovechable como antecedente, pero debe conectarse al estado diario real del motor.
- `backend/workers/batchWorker.ts`: recibe `aiPolicySpec` pero no la ejecuta; sustituye `AI_CORTAFUEGOS` por `SMART_CORTAFUEGOS`.
- Los servicios de trabajos dependen de `InMemoryDatabase`. `infra/template.yaml` declara una Lambda síncrona y una tabla con clave `scenarioKey`, no el contrato PK/SK de esos servicios. No asumir integración productiva.
- `src/domain/prng.ts`: la semilla incluye el identificador de estrategia. La misma semilla visible no garantiza el mismo ruido epidémico entre estrategias.
- `docs/00-especificacion-reto.md`: el mayor peso corresponde a prueba de fuego, rigor, adaptación y claridad. El efecto visual debe respaldar evidencia, no sustituirla.

No se inspeccionó la cuenta AWS ni se consultaron precios o documentación externa para este borrador.

### 2.1 Actualización tras integrar main `b53b52b`

La rama incorporó por fast-forward el paquete `docs/features/committee-learning/`. El delta desde `0e7824e` añade planificación, contratos y evidencia; no modifica `src/`, `backend/` ni `infra/`. El tracker mantiene T1–T18 en `todo`. No confundir el motor experimental archivado como `.ts.txt` con una implementación integrada.

Nuevos puntos de conexión previstos:
- ADR-0011/T1: quinto argumento opcional del motor `{ onDailyDecision?, envNamespace? }`, manteniendo paridad de llamadas existentes. Reutilizar ese punto de extensión, no crear un fork.
- La familia Comité v1 aprende solo cuatro pesos de cordón/fumigación; no crea lógica arbitraria ni incorpora horarios.
- `onDailyDecision` permite decidir acciones existentes. Por sí solo no permite factores continuos de contacto/movilidad ni nuevos estados. Para medidas dinámicas hay que acordar un contrato adicional de efectos tipados y validados; no reinterpretar silenciosamente un toque de queda como un cordón completo.
- OpenAPI Comité rechaza propiedades adicionales y no admite medidas dinámicas. Hace falta una extensión coordinada/versionada; no enviar campos que el worker ignorará.
- El plan Comité usa un único worker asíncrono acotado, no una infraestructura de miles de Lambdas. Esta área no altera esa decisión ni muestra ese cómputo.
- La biblioteca global contiene solo pesos compatibles; nuestra biblioteca de definiciones de medidas debe ser distinta. Añadir efectos requiere revisar compatibilidad por conjunto/hash de intervenciones, no reutilizar garantías anteriores automáticamente.

Propuesta para coordinar con Mateo:
1. Él conserva la implementación del seam T1 y de su buscador; nosotros definimos el contrato del editor y compilador.
2. Acordar efectos diarios para contactos locales y movilidad por ámbito, costos, precedencia respecto a acciones y trazas. El compilador de horarios produce estos efectos; el motor los aplica dentro de las ecuaciones.
3. Entregar las definiciones como configuración inmutable, cargada/validada en servidor, con hash y versión del intérprete. Los callbacks son funciones confiables del runtime, nunca código serializado del LLM.
4. Separar «evaluar una medida fija» de «optimizar sus parámetros». Su CEM de cuatro pesos puede eventualmente evaluar un escenario con medidas fijas si se integra el intérprete; no puede buscar horarios sin ampliar su espacio de búsqueda y revalidar el protocolo.
5. Definir comparaciones: política con medidas fijas vs baselines bajo esas mismas condiciones, o intervención vs contrafactual sin ella. Son preguntas diferentes; no mezclar sus métricas de mejora.

Evidencia recibida: el reporte local archivado encontró empate frente a SGC en el escenario estándar y aproximadamente 3.02% menos contagios en el alterado sobre 128 réplicas finales por escenario. Son resultados del experimento de cuatro pesos, no de nuestras medidas dinámicas ni del protocolo progresivo de producto. No se reejecutó ni verificó independientemente ese experimento en esta revisión.

### 2.2 Reutilización del alcance de Mateo (diseño, no código disponible)

| Elemento de su spec | Uso en nuestra spec | Frontera / condición |
| --- | --- | --- |
| ADR-0011, T1: callback diario y namespace opcional | Conectar reglas al estado actual; conservar un único motor | Requiere ampliar contrato para efectos continuos; no crear seams incompatibles. |
| AC-06/AC-10: contexto e invariantes | Adoptar conservación, presupuesto común, vacunación solo S y ausencia de acceso al futuro | Excluir seeds, runIndex y streams del contexto del intérprete, aunque SimulationParams los contenga. |
| RunManifest / versiones | Adjuntar snapshot de medidas, configuración, supuestos, perfil horario y versiones del compilador/intérprete | Extensión propuesta. Un hash sin contenido recuperable no permite reproducir. |
| ADR-0007, T13: ModeShell | Proponer editor como subvista de Comité sin perder partida | Ubicación pendiente; no construir otro shell ni un cuarto modo sin aprobación. |
| F4 / T15: adapters de snapshots sin CureGame | Compartir visualización por snapshots, evitando un segundo modelo | Añadir traza de efectos; no representar medidas nuevas solo como órdenes legadas. |
| Auth por sesión y ownerHash del servidor | Adoptar patrón para medidas/conversaciones privadas | No confiar en ownerHash del cliente. Sesión efímera no garantiza biblioteca recuperable tras nuevo login. |
| Artefactos inmutables y revisiones monotónicas | Versiones de medidas y prevención de respuestas obsoletas del agente | Revisión del editor y stateRevision de jobs son contadores distintos; actualizar por comparación de revisión. |
| Errores `{ code, message, details? }` | Adoptar envelope con códigos del editor | Distinguir medida inválida, capacidad no soportada y versión incompatible. |
| Biblioteca de pesos compatibles | Adoptar principio de compatibilidad | Biblioteca de medidas separada de entradas w0..w3. |
| CEM, pools, cuotas, worker y progreso | Consumir solo mediante contrato cuando sea necesario | No duplicar infraestructura, buscador ni UI de cómputo. |

Adoptar el protocolo RNG de Mateo sin introducir una reestructuración adicional de streams desde el editor. Sus namespaces compartidos no garantizan idénticos draws por transición cuando las ramas dependen del estado.

## 3. Decisión central recomendada

Construir un lenguaje declarativo restringido de intervenciones (DSL), un compilador/intérprete determinista y un formulario generado por esquema.

El agente redacta datos estructurados, no JavaScript. El servidor valida y compila esos datos. El motor aplica únicamente operaciones conocidas. El frontend renderiza únicamente componentes permitidos.

Esto permite crear medidas nuevas por combinación sin escribir una pantalla o una función específica para cada nombre. No permite inventar fenómenos que el motor no representa. En ese caso el agente debe declarar la limitación y proponer una ampliación, nunca simular que el efecto existe.

Alternativas descartadas para el MVP:
- Código arbitrario generado por IA: inseguro, difícil de auditar y reproducir.
- Catálogo cerrado de presets: confiable, pero no satisface la creación conversacional.
- Agentes individuales y pasos horarios completos: alto alcance y costo antes de demostrar el ciclo básico.
- Una llamada al LLM por réplica o día: latencia y costo innecesarios.

## 4. Contrato conceptual de una medida

`InterventionDefinition` debe incluir:
- Identidad estable, versión de esquema, versión de medida y descripción.
- Parámetros tipados: booleano, número, proporción, hora, rango de días, conjunto de nodos y enumeración. Unidades, valores por defecto y límites obligatorios.
- Presentación restringida: etiqueta, ayuda y widget permitido. Sin HTML, scripts, CSS ni URLs ejecutables del modelo.
- Ámbito espacial y calendario: nodos/corredores, intervalo de días y horario local del escenario.
- Condiciones sobre observables disponibles al decidir: prevalencia, capacidad hospitalaria u otros campos autorizados; nunca datos futuros.
- Efectos mediante operadores permitidos y expresiones tipadas de profundidad/tamaño limitados.
- Costos: activación, por día y/o por zona, con unidades explícitas.
- Supuestos: eficacia, cumplimiento, procedencia y estado hipotético o respaldado.
- Dominio de búsqueda opcional: qué parámetros puede optimizar el sistema y cuáles quedan fijados por la persona.

Separar definición reutilizable, configuración de una instancia y artefacto compilado inmutable. Editar genera una nueva versión; no altera trabajos iniciados ni resultados históricos.

Operadores iniciales propuestos:
1. Multiplicar contactos locales de un ámbito.
2. Multiplicar movilidad por corredor o por nodos incidentes.
3. Activar efectos por calendario o condición observable.
4. Asignar intervenciones existentes con presupuesto y elegibilidad.
5. Consumir recursos con una política determinista si son insuficientes.

No exponer modificación libre de `betaHuman`, población o eficacia vacunal como una intervención. Cambiar el escenario es otra operación y otra comparación.

## 5. Ejemplo: toque de queda

Petición: «Crea un toque de queda de 22:00 a 05:00 en Tarqui y déjame cambiar el horario».

Flujo:
1. Resolver Tarqui a identificadores del grafo y confirmar ambigüedades.
2. Proponer horario, días, alcance, cumplimiento, reducción de movilidad y costo. Los valores no aportados son supuestos visibles pendientes de aceptación.
3. Mostrar una vista previa del formulario y una explicación de qué término del motor cambia.
4. Tras confirmar, guardar una versión y añadir su tarjeta al panel.
5. Al editar, marcar resultados anteriores como correspondientes a otra versión; recalcular solo mediante un nuevo experimento.

Semántica temporal recomendada para MVP:
- Conservar transición SEIR diaria y estimar el efecto diario integrando una plantilla de contactos/movilidad por franja horaria.
- La plantilla debe ser explícita, normalizada y documentada como hipótesis si no existen datos.
- Para cada canal y zona: multiplicador diario = suma de peso de franja por multiplicador combinado de medidas activas en esa franja.
- Resolver intervalos que cruzan medianoche; inicio inclusivo y fin exclusivo. Rechazar inicio igual a fin o solicitar explícitamente modalidad de 24 horas.
- Sin perfil intradiario, dos horarios de igual duración tienen el mismo efecto: debe decirse, no ocultarse.
- No presentar esta aproximación como una simulación por horas. Solo añadir pasos intradiarios si el requisito lo justifica y se valida su costo.

## 6. Composición, límites y presupuesto

Los efectos concurrentes deben combinarse dentro de cada franja y luego integrarse; multiplicar promedios diarios puede dar resultados incorrectos cuando los horarios se superponen.

Para MVP, proponer multiplicación de factores acotados a [0,1] por canal, con cumplimiento incorporado una sola vez en el factor de cada medida. Documentar la hipótesis de composición; no afirmar independencia real. Detectar medidas duplicadas y mostrar advertencia de superposición.

Definir un orden estable de resolución y gasto. Si falta presupuesto, aplicar una regla visible de prioridad y selección de zonas; registrar medidas omitidas. Costos sin estimar impiden promover una comparación como equitativa; no asumir que una restricción potente es gratuita.

Mantener invariantes: conservación de población, valores finitos/no negativos, presupuesto no excedido y vacunación solo de susceptibles. Ninguna medida puede cambiar las reglas de puntuación ni leer las semillas de prueba.

## 7. Ciclo del agente y frontera de responsabilidad

Conversación → borrador estructurado → validación → vista previa/aprobación → compilación → evaluación → explicación.

Herramientas de esta área: consultar capacidades/observables, proponer medida, validar, mostrar diferencias, confirmar versión, previsualizar efectos, editar/desactivar y guardar. Exportar a evaluación es una integración acordada con Mateo; admisión, estado y cancelación de sus jobs no se reimplementan aquí. Solo el servidor autoriza acciones y cuotas; una petición en lenguaje natural no otorga permisos.

El LLM propone estructuras y puede explicar resultados reales recibidos. Esta área no implementa búsqueda masiva ni decide su algoritmo. El servicio externo podrá consumir definiciones y configuraciones compiladas si se acuerda el contrato con Mateo.

La creatividad del agente puede sugerir combinaciones; los efectos los calcula el motor. Primero debe funcionar una medida de extremo a extremo. No presentar la creación conversacional como aprendizaje o validación estadística por sí sola.

No existe un enum de nombres de medidas permitidas. El usuario puede pedir libremente; el agente combina operadores, parámetros y condiciones. Si la petición es ambigua, aclara. Si falta un fenómeno del modelo, explica el límite y ofrece una aproximación explícita para aprobación o registra una necesidad de ampliación. Nunca crear un control decorativo ni aplicar una aproximación silenciosa.

### 7.1 Ciclo de vida y sincronización

Estados conceptuales de la medida, distintos de los estados de jobs de Mateo:
- `draft`: propuesta aún editable; no aplicada.
- `needs-clarification`: falta información o hay ambigüedad espacial/semántica.
- `ready-for-review`: definición válida, con efectos y supuestos visibles.
- `confirmed`: revisión aprobada, disponible para guardar/compilar.
- `incompatible`: requiere capacidades o versiones que el runtime no soporta; no ejecutable.

Activar/desactivar pertenece a la configuración de una instancia, no a la definición reutilizable. Guardar no implica activar ni iniciar evaluación. Confirmar congela una revisión; cualquier cambio posterior crea otra y requiere revisión antes de exportarse. Referencias históricas siguen apuntando a la versión anterior aunque se retire de la biblioteca.

Chat y formulario operan sobre el mismo documento estructurado y número de revisión. Toda propuesta indica `baseRevision`; si el usuario editó mientras el agente respondía, se muestra conflicto/diferencia y se revalida, sin sobrescribir valores. Una edición manual que cambie un supuesto invalida su confirmación anterior.

Las medidas se crean por conversación, pero una vez creadas sus parámetros se editan también desde el menú. No exigir volver al chat para cambiar cada valor. Desactivar es reversible; eliminar una instancia no borra artefactos ya usados en evaluaciones.

## 8. Requisitos de compatibilidad para evaluación externa

Esta sección recoge condiciones a coordinar con Mateo; no asigna a esta área la implementación de comparadores, buscadores o validación estadística.

- Mantener las líneas base sin intervención y aleatoria del reto; incluir SGC y la candidata.
- Objetivo principal: media de contagios acumulados al horizonte elegido. El motor actual cuenta E+I iniciales y nuevas exposiciones S→E; explicitar esta semántica.
- Reportar dispersión, colapso hospitalario, gasto y medidas aplicadas. No ocultar diferencias negativas ni llamar vidas salvadas a infecciones evitadas.
- Separar semillas de búsqueda, validación y evaluación final; limitar la reutilización de validación y no seleccionar con el conjunto final.
- Adoptar las etiquetas de progreso y auditoría de Mateo sin redefinir su promoción: su protocolo propuesto exige mejora media estricta y evidencia bootstrap. No añadir desde esta área un porcentaje mínimo no acordado. Las garantías para medidas nuevas requieren validación propia, no heredan el experimento de cuatro pesos.
- Usar el protocolo aleatorio versionado del área de evaluación y conservar paridad del juego. No inferir ruido idéntico por transición de una misma semilla ni modificar namespaces desde las definiciones del agente.
- Conservar hashes de escenario, medidas, política compilada, motor y protocolo aleatorio, además del manifiesto de semillas.
- Mostrar una trayectoria representativa identificada, no escoger retrospectivamente la más favorable.

## 9. Contrato de integración con el área de Mateo

Fuera del alcance de esta área: infraestructura de paralelismo, workers masivos, algoritmos de búsqueda, panel de lotes y progreso de miles de simulaciones. No prescribir aquí servicios AWS ni duplicar esa implementación.

Acordar con Mateo antes de programar la integración:
- Entrada: escenario inmutable, definiciones/configuraciones de medidas, versión/hash del artefacto compilado y versión del intérprete.
- Parámetros fijos frente a parámetros explorables, con tipos, unidades, límites y restricciones conjuntas.
- Ejecución: una biblioteca compartida y determinista de efectos para evitar implementaciones distintas entre el editor y los workers.
- Salida: identificador del experimento y resultados asociados a las versiones exactas, si esta área necesita consumirlos.
- Errores de compatibilidad: rechazar operadores/versiones no soportados; nunca ignorar una medida silenciosamente.
- Límites del payload, propiedad de los contratos y pruebas de compatibilidad entre ambas áreas.

La persistencia de medidas y conversación sí pertenece a este editor; su tecnología y permisos quedan pendientes. Una previsualización pequeña del efecto puede pertenecer al editor, pero no debe confundirse con evaluación masiva o evidencia de mejora.

### 9.1 Extensión mínima que proponemos acordar

No modificar unilateralmente OpenAPI ni la familia de cuatro pesos. Proponer un paquete lógico `InterventionBundle` (nombre provisional) con:
- Versión de esquema y capacidades requeridas.
- Definiciones/configuraciones congeladas, identificadores/versiones y hash canónico.
- Supuestos aceptados y perfil horario usado para la integración diaria.
- Versiones del compilador/intérprete y referencias recuperables a sus artefactos.

La referencia del bundle se resuelve y autoriza en servidor; el navegador no envía funciones ni efectos diarios considerados confiables. Falta acordar el campo/ruta exactos y límites con Mateo.

Contrato interno propuesto, no una firma aprobada:
1. El runtime entrega al intérprete una vista inmutable del estado anterior a la transición, día, grafo y recursos permitidos. No se consultan estados futuros.
2. El intérprete produce intenciones, factores de contactos/movilidad y solicitudes de recursos trazables.
3. Un único resolvedor compartido decide admisión y gasto junto con las acciones de política. Propuesta inicial: costos de medidas configuradas primero y política con el remanente; requiere aprobación porque cambia la semántica de presupuesto de su política.
4. Solo se aplican efectos admitidos. Si no se puede pagar, no queda activo el efecto. Definir interacción con cordones y acciones para evitar doble cobro/aplicación.
5. El snapshot incorpora una extensión versionada con medida/versión, ámbito, condiciones activadas, efectos aplicados, costos y motivos de omisión. La UI no deduce efectos del texto del chat.

Bundle vacío o medidas desactivadas debe conservar paridad exacta. Compartir fixtures: mismos artefactos/configuración generan iguales efectos y métricas. Manifiesto y compatibilidad de warmstarts deben considerar el bundle antes de afirmar reproducibilidad o reutilizar recomendaciones.

### 9.2 Qué puede avanzar sin bloquear a Mateo

Esquema de definiciones, validación, formulario, conversación, diferencias/versionado y previsualización de factores diarios pueden desarrollarse contra un puerto de capacidades documentado. La previsualización se etiqueta como cálculo de efectos, no como pronóstico de contagios.

Integración epidemiológica y exportación quedan bloqueadas hasta acordar: hook de efectos, orden de presupuesto, traza, compatibilidad y transporte del bundle. No esperar al CEM para construir el editor; tampoco anunciar integración completa con un mock.

## 10. Experiencia «wow» verificable

Propuesta: subvista «Diseñar medidas» dentro de Comité, con conversación, tarjetas dinámicas, mapa y explicación de efectos. Reutilizar ModeShell previsto por Mateo; no reemplazar su panel de aprendizaje ni mostrar aquí su cómputo. Ubicación pendiente de aprobación.

Demostración propuesta:
1. El jurado elige semilla o cambia el brote.
2. Pide una medida, por ejemplo toque de queda; aparece el borrador de controles con su interpretación.
3. Confirma y ve zonas y calendario resaltados en el mapa.
4. Cambia el horario y observa la diferencia de configuración y el efecto calculado en una previsualización, sin falsificar una mejora instantánea.
5. Pide por chat una modificación no predefinida, por ejemplo «exceptúa los corredores del hospital y actívalo solo si aumenta la prevalencia».
6. Aparecen los nuevos controles, condiciones y diferencias de la medida, sujetos a capacidades reales del motor.
7. Confirma y guarda la versión reutilizable, disponible para que el área de Mateo la evalúe mediante el contrato acordado. No mostrar aquí lotes ni progreso de miles de simulaciones.

Mapa: capa de medidas por zona, corredores atenuados y distintivo horario. La capa debe proceder del mismo registro de efectos aplicados del motor, no de una interpretación paralela del chat. No representar flujo vehicular individual como si estuviera modelado.

El fallback debe ser honesto: IA no disponible, recuperación de definición guardada o rechazo de medida no soportada. Resultados precomputados solo con etiqueta de archivo, configuración y fecha; nunca como una ejecución nueva.

Metas de latencia y volumen se establecerán tras medir. No prometer que la demo siempre encontrará una mejora.

## 11. Plan incremental y aceptación

1. Contratos: acordar con Mateo capacidades, efectos, presupuesto, trazas y bundle. Reutilizar su protocolo de evaluación sin rediseñarlo. Medir por separado latencia y consumo del agente/editor.
2. Corte vertical sin IA: definición declarativa de toque de queda → formulario → motor → comparación pequeña → traza en mapa. Debe producir un efecto comprobable sin romper regresiones del juego.
3. Creación conversacional: Bedrock con salidas validadas, aclaraciones, vista previa, confirmación y versionado; también editar y eliminar mediante chat.
4. Integración con Mateo: acordar contrato, exportar artefactos y probar que el intérprete compartido produce los mismos efectos en ambas áreas. No implementar su paralelismo ni buscador.
5. Creación abierta y persistencia: probar peticiones no predefinidas, edición conversacional, versiones y reutilización.
6. Demo y endurecimiento: Brote Sorpresa, fallos de IA, reproducibilidad, límites y costos del agente.

### 11.1 Criterios de aceptación verificables

| ID | Condición / acción | Resultado exigido |
| --- | --- | --- |
| AG-01 | El usuario solicita una medida no predefinida pero expresable | Se genera una definición y formulario válidos sin añadir componentes específicos. |
| AG-02 | Faltan alcance, efecto o supuestos necesarios | El agente aclara o presenta hipótesis explícitas para confirmación; no activa efectos inventados. |
| AG-03 | Se edita un parámetro por chat o menú | Se actualiza el mismo documento, se revalida y se identifica la revisión. |
| AG-04 | El horario cruza medianoche | Se integra correctamente al paso diario y se explica la aproximación. |
| AG-05 | Hay conflicto entre medidas o recursos insuficientes | El resolvedor aplica la política acordada y registra omisiones/costos sin exceder presupuesto. |
| AG-06 | Se solicita una capacidad no soportada o código ejecutable | Se rechaza su ejecución y se explica el límite; no aparece como una medida activa funcional. |
| AG-07 | Se exporta un bundle confirmado | Incluye versiones, configuración, supuestos y perfil horario recuperables; no cambia por futuras ediciones. |
| AG-08 | Se ejecuta una medida admitida | Sus efectos llegan al motor y la capa visual procede de la traza aplicada, no del texto del agente. |
| AG-09 | Bundle vacío o medidas desactivadas | Se conserva paridad exacta con el comportamiento anterior. |
| AG-10 | Se recibe una respuesta obsoleta o una versión incompatible | No sobrescribe ediciones ni se ignoran efectos silenciosamente. |
| AG-11 | El modelo de IA no responde | Se comunica el fallo; no se pierden medidas confirmadas ni se atribuye una generación de respaldo a la IA. |
| AG-12 | Se cambia entre editor y juego | No se pierde la partida ni se inyectan medidas en la campaña. |

AG-05, AG-07 y AG-08 requieren el contrato compartido; no declararlos completos usando solo mocks. Las pruebas de integración AWS se coordinan con Mateo y requieren autorización del entorno.

### 11.2 Pruebas mínimas
- Crear al menos tres composiciones distintas: toque de queda, restricción de corredores y contención por umbral; sin añadir un componente React específico por medida.
- El horario nocturno cruzando medianoche funciona; horarios equivalentes bajo perfil uniforme producen igual factor diario.
- Medida desactivada equivale a no aplicarla; cambios de parámetros llegan al compilador y al motor.
- Solapamientos, falta de presupuesto y condiciones por umbral tienen resultados deterministas y trazables.
- Rechazo de código, operadores desconocidos, identificadores inválidos y payloads excesivos.
- Mismo artefacto y semillas: mismas métricas entre ejecución local y AWS, excluyendo tiempos y metadatos variables.
- Edición concurrente no altera una versión ya exportada a evaluación.
- Una petición nueva no exige añadir su nombre a un catálogo ni escribir un componente React específico, siempre que se pueda expresar con capacidades soportadas.
- Operadores/versiones incompatibles se rechazan explícitamente en la integración.
- Bundle vacío conserva comportamiento previo; acciones manuales mantienen precedencia según el seam de Mateo. Definir si se admiten medidas en ese contexto.
- Medidas con costo y política simultáneas no exceden presupuesto ni cuentan dos veces efectos/recursos.
- El snapshot reproduce las capas del mapa sin interpretar lenguaje natural.
- Respuestas tardías del agente no sobrescriben una revisión más reciente del formulario.
- La integración identifica si evalúa una estrategia bajo medidas comunes o una medida contra su contrafactual; no confunde ambas mejoras.

### 11.3 Implementación funcional en Investigación

Por solicitud posterior del usuario se implementó el espacio real Juego/Investigación, el DSL supervisado y la extensión de efectos al motor compartido. No es un mock ni la antigua demo descartada. Ver [configuración, pruebas y límites](features/research-workspace/IMPLEMENTATION.md).

El motor actual usa quinto argumento `DifficultyGraph`; se preservó y el resolver experimental ocupa un sexto argumento opcional. Esta discrepancia con el plan de Mateo requiere coordinación antes de integrar su T1. La prioridad medidas→política es una decisión explícita de la primera implementación local, no un acuerdo supuesto con su buscador. El bundle de integración y sus garantías continúan pendientes.

## 12. Decisiones necesarias antes de cerrar la spec

Confirmado: composición de capacidades, aproximación diaria de horarios y creación sin catálogo cerrado. Evaluación masiva fuera de esta área, a cargo de Mateo.

Decisiones del espacio de investigación confirmadas: **1A, 2C, 3A, 4C, 5A, 6B, 7B**. Pestañas Juego/Investigación; escenario nuevo o copia independiente; sin victoria/derrota ni barra de cura; control diario manual y automático; agente supervisado con confirmación antes de aplicar; panel avanzado sin ecuaciones arbitrarias; persistencia en navegador con exportación/importación versionada. Estas decisiones sustituyen las propuestas anteriores de ubicación y guardado que entren en conflicto.

Pendiente:
1. Detalles del contrato de confirmación del usuario para supuestos y revisiones; no hay aprobación ni aplicación autónoma en esta etapa.
2. Organización interna de Investigación respecto al módulo de Mateo, sin duplicar shells. El acceso mediante pestañas Juego/Investigación ya está confirmado.
3. Presupuesto y latencia del agente/editor y usuarios concurrentes. Modelo identificado tras consultar la ficha oficial: OpenAI GPT-6 Luna, ID `gpt-6-luna`, mediante Responses API del servidor. Disponibilidad en la cuenta aún no comprobada.
4. Esquema de almacenamiento local, migraciones, importación validada y límites. Persistencia cloud y biblioteca compartida fuera de la primera entrega.
5. Acuerdo con Mateo sobre hook de efectos, presupuesto compartido, interacción con acciones existentes, traza de snapshots, compatibilidad y transporte del bundle. Es bloqueo de integración, no de diseño del editor.
6. Tratamiento de medidas al reproducir acciones manuales: el juego/campaña permanecen sin cambios salvo decisión explícita posterior.

Los ejemplos diversos son fixtures para probar expresividad, no una lista de medidas admitidas. Presupuesto y contratos técnicos pendientes no se consideran aprobados por las selecciones de producto. El proveedor/modelo del agente queda registrado como OpenAI `gpt-6-luna` tras la consulta solicitada por el usuario. Ubicación principal y persistencia local sí están confirmadas en el documento de investigación.
