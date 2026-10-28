# Espacio de investigación — alcance y características

Estado: siete decisiones confirmadas e implementación local funcional realizada por solicitud del usuario. Integración con Mateo y verificación real del proveedor pendientes. No autoriza despliegue ni gasto cloud.

Ver [implementación, configuración y límites](IMPLEMENTATION.md) para lo que está disponible, cómo habilitar Luna en servidor y las pruebas efectuadas.
Rama de trabajo: `implementacion-ajustes-de-variables`.

## 1. Concepto

Agregar a Operación Manta Cero un espacio de investigación experimental distinguible del juego. Su propósito es formular escenarios e hipótesis, crear medidas mediante un agente, configurar parámetros, observar la evolución epidemiológica y preparar experimentos reproducibles.

No es una partida sin minijuegos ni el indicador de «investigación de la cura» que ya aparece en el juego. Es otro contexto de trabajo, con estado, navegación, lenguaje, objetivos y resultados propios.

**Límite científico:** una herramienta con metodología experimental no convierte automáticamente el simulador en un modelo epidemiológico calibrado. Deben mostrarse supuestos, incertidumbre, procedencia y limitaciones. No anunciar validación clínica, eficacia real ni óptimos globales sin evidencia.

## 2. Requisitos confirmados por el usuario

- El producto actual funciona como juego; el nuevo trabajo tiene una finalidad investigativa.
- Debe existir una sección que haga explícito el cambio de dinámica hacia investigación.
- Decisión 1A: acceso mediante pestañas principales «Juego / Investigación» dentro de la app.
- Decisión 2C: al iniciar, permitir elegir entre escenario nuevo y copia independiente del escenario de la partida, sin recompensas ni referencias mutables compartidas.
- Mantener el mapa táctico existente y sus perspectivas 2D cenital / 3D inclinada sobre la misma instancia de mapa.
- No incluir minijuegos en esta sección.
- Decisión 3A: conservar infección, intervenciones y recursos configurables, sin victoria/derrota ni barra de desarrollo de cura.
- Decisión 4C: ofrecer avance manual por día y reproducción automática con pausa y velocidad.
- Decisión 5A: el agente propone y configura; el usuario confirma antes de aplicar medidas. No hay activación autónoma implícita.
- Decisión 6B: parámetros actuales, panel avanzado y medidas dinámicas, sin edición arbitraria de ecuaciones en la primera entrega.
- Decisión 7B: guardar en este navegador y ofrecer exportación/importación versionada; no crear una biblioteca cloud o compartida en esta etapa.
- Implementar realmente el agente creador de medidas y el menú dinámico definidos en la spec previa; no entregar otro mock como sustituto.
- Creación de medidas sin catálogo cerrado, por composición de capacidades soportadas. Declarar límites del motor.
- Horarios aproximados mediante integración diaria para la primera versión, con su limitación visible.
- El cómputo masivo y su presentación corresponden al área de Mateo; no duplicarlos en el editor.

## 3. Relación con los documentos existentes

- [Spec del agente y medidas](../../spec-agente-variables.md): contratos de medidas, controles, versiones, efectos, seguridad y aceptación. Este documento amplía su contexto de producto; no reemplaza esos contratos.
- [Spec de aprendizaje de Mateo](../committee-learning/spec.md): búsqueda, evaluación, promoción y auditoría.
- [Arquitectura de Mateo](../committee-learning/sad.md): motor compartido, separación del juego, versiones y adaptadores de reproducción.

«Comité» es la denominación del plan de aprendizaje existente. «Investigación» es el nombre propuesto para el espacio orientado al usuario; la relación exacta entre ambos en navegación sigue pendiente. No implementar dos shells competidores ni asumir que el módulo de Mateo ya está integrado.

La separación de responsabilidades se mantiene: nuestro editor define y exporta medidas; Mateo evalúa según contratos acordados. Cambiar el nombre o ubicación no cambia la propiedad de su implementación.

## 4. Inventario funcional propuesto

| Área | Características | Estado |
| --- | --- | --- |
| Entrada y contexto | Pestañas «Juego / Investigación», encabezado propio, aviso de modelo educativo, retorno al juego sin perder partida | Acceso confirmado por 1A |
| Mapa | Mapa táctico real 2D/3D, capas de contagios/protección, selección de zonas, cámara y orientación al norte | Reutilización confirmada; adaptar selección a inspección, no a misiones |
| Escenario | Nuevo o copia independiente; parámetros actuales y panel avanzado, recursos, horizonte y semilla | Confirmado por 2C/6B; rangos y semántica de copia por precisar |
| Agente | Conversación para crear/editar medidas, aclaraciones y confirmación del usuario antes de aplicar | Supervisado por 5A; OpenAI GPT-6 Luna (`gpt-6-luna`); presupuesto pendiente |
| Menú dinámico | Horarios, zonas, intensidad, cumplimiento, costos, condiciones, activación y excepciones | Generado desde definiciones, no por nombre de medida |
| Experimento | Configuración independiente, sin victoria/derrota ni progreso de cura; revisión congelada antes de ejecutar | Separación confirmada por 2C/3A |
| Evolución | Avance diario manual y reproducción automática con pausa/velocidad; inspección de estados y acciones | Confirmado por 4C |
| Evidencia | Curvas, métricas y trazas disponibles; origen de datos y alcance explícitos | Sin inventar resultados ni duplicar panel masivo |
| Reutilización | Guardado local en navegador; exportación e importación versionadas de medidas/configuraciones | Confirmado por 7B; formato y migraciones por definir |
| Integración Mateo | Bundle de medidas, compatibilidad, presupuestos y snapshots acordados | Dependencia de contrato, no integración existente |

## 5. Separación entre juego e investigación

### Reutilizar

- Grafo urbano, lógica SEIR-V y generación aleatoria reproducible.
- Mapa táctico, capas, selección y adaptadores de snapshots.
- Conceptos de vacunación, fumigación, cordones y recursos donde tengan semántica experimental explícita.
- Validación, invariantes y componentes visuales que no dependan de una partida.

### No trasladar

- Minijuegos, misiones de campo, puntería y recompensas por habilidad.
- Bonos gratuitos obtenidos jugando, desbloqueos o estado de campaña.
- Instrucciones y botones que inviten a completar una misión cuando se inspecciona un barrio.
- Mensajes de victoria/derrota como sustitutos de resultados de un experimento.

### Reglas resueltas y detalles pendientes

- Se elimina de investigación la mecánica de progreso de cura y victoria/derrota (3A); el juego permanece intacto.
- Se conservan recursos configurables. Falta acordar rangos y resolución del presupuesto entre medidas y política.
- Tiempo manual y automático confirmados (4C); velocidades y semántica exacta de pausa se fijarán en el contrato de ejecución.
- La primera implementación copia parámetros/configuración inicial, no el estado epidemiológico del día actual; la interfaz lo declara. La opción nuevo/copia está confirmada por 2C; copiar nunca transfiere recompensas ni permite modificar la partida desde el experimento.

No llamar a `advanceDay` de `cureGame.ts` sin revisión: contiene progreso de cura, condiciones de victoria/derrota y reglas de campaña. La ejecución investigativa debe usar el motor compartido con un controlador propio, no copiar ecuaciones ni heredar terminaciones del juego accidentalmente.

Los estados propuestos de una ejecución son preparada / en ejecución / pausada / completada / cancelada / fallida, distintos de playing/won/lost. Definirlos como contrato tras decidir controles temporales.

## 6. Experiencia visual propuesta

- Identificación persistente: «Investigación · Simulación experimental».
- Acciones orientadas a escenario, medidas, ejecución y resultados; no misiones, recompensas o victoria.
- Mantener identidad visual de Manta Cero, pero reorganizar jerarquía: hipótesis/configuración → mapa → observación/evidencia.
- Seleccionar una zona abre su ficha de observación: estado, parámetros pertinentes, medidas y trazas.
- Conversación y controles comparten definición y revisión; los cambios pendientes no alteran una ejecución congelada.
- Distinguir «efecto propuesto», «efecto aplicado» y «resultado evaluado».
- No mostrar porcentajes de mejora o ahorro sin un experimento que los respalde.

Las pestañas «Juego / Investigación» y las decisiones del apartado 10 están confirmadas. El layout detallado debe respetarlas; no se requiere volver a preguntar esas elecciones.

## 7. Flujo objetivo propuesto

1. Entrar al espacio de investigación y reconocer que no se está jugando.
2. Crear o abrir una configuración experimental independiente.
3. Configurar escenario, recursos, horizonte y semilla.
4. Conversar con el agente para crear/editar medidas y revisar controles, efectos y supuestos.
5. Confirmar una revisión e iniciar una ejecución según el control temporal elegido.
6. Inspeccionar la evolución en mapa, curvas y trazas.
7. Preparar otra configuración o enviar la configuración congelada al área de evaluación de Mateo mediante contrato acordado.
8. Conservar/exportar la evidencia que permita reproducir lo observado.

## 8. Contratos y dependencias técnicas

### Modelo del agente

El usuario solicitó Luna de OpenAI. Verificación en la [ficha oficial de GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna): el ID publicado es **`gpt-6-luna`**, no `luna-6.1`. El [catálogo oficial](https://developers.openai.com/api/docs/models) distingue GPT-6 Luna de GPT-6.1 Sol/Terra.

Integración prevista: Responses API desde servidor, con salidas estructuradas validadas. La ficha declara soporte de structured outputs y function calling. La clave nunca se expone al navegador. Mantener el ID configurable en servidor y reportar falta de acceso/modelo o credenciales como error real, sin sustituir el agente por un mock silencioso. No se ha comprobado disponibilidad en la cuenta del proyecto ni realizado llamadas de pago.

### Integración del dominio

- Controlador de investigación independiente de CureGame y de sus recompensas/objetivos.
- Una sola implementación del motor epidemiológico y del intérprete de medidas para previsualización compatible y evaluación.
- Contexto de decisión sin acceso a semillas, índice de réplica ni estados futuros.
- Bundle con definiciones, valores, supuestos aceptados, perfil horario, versiones e información recuperable, no solo hashes.
- Presupuesto común, precedencia respecto a política y composición de medidas acordados con Mateo.
- Snapshots extendidos para explicar qué medida se aplicó, dónde, cuándo, a qué costo y por qué pudo omitirse.
- Partida y experimento nunca comparten objetos mutables; alternar de sección no produce acciones cruzadas.
- La semántica de contagios acumulados y el horizonte finito deben declararse en resultados.
- Autenticación y persistencia coherentes con el producto. El ownerHash por sesión del plan de Mateo no resuelve por sí solo recuperación de experimentos tras un nuevo login.

## 9. Criterios de aceptación de producto propuestos

- INV-01: al entrar es inequívoco que el usuario está en investigación; hay una forma clara de volver al juego.
- INV-02: no hay minijuegos, recompensas ni rutas de misión en las interacciones de investigación.
- INV-03: infección, intervenciones y métricas proceden del motor compartido, no de un mock ni de ecuaciones duplicadas.
- INV-04: alternar secciones conserva el estado acordado sin contaminar recursos, acciones ni versiones entre ambas.
- INV-05: una medida creada por el agente produce controles editables y efectos trazables reales para capacidades soportadas.
- INV-06: semilla, escenario y artefactos congelados reproducen las métricas; tiempo de ejecución y metadatos variables quedan excluidos.
- INV-07: se distinguen supuestos hipotéticos, limitaciones del simulador y datos verificados; no se promete validez clínica.
- INV-08: sin ejecutar el evaluador de Mateo no se anuncian mejoras validadas ni simulaciones masivas realizadas.
- INV-09: el experimento no usa victoria/derrota ni progreso de cura del juego; termina por horizonte o control explícito de ejecución.
- INV-10: se puede avanzar manualmente o reproducir con pausa/velocidad sin cambiar la semilla ni introducir pasos duplicados.
- INV-11: ninguna medida propuesta por el agente se aplica sin confirmar su revisión.
- INV-12: guardado local y exportación/importación conservan configuración y versiones. La importación valida esquema/capacidades y rechaza código o datos incompatibles sin alterar un experimento válido; errores de cuota o almacenamiento del navegador se comunican.

## 10. Decisiones por selección

Respuestas confirmadas por el usuario: **1A, 2C, 3A, 4C, 5A, 6B, 7B**. No quedan pendientes las siete elecciones de esta sección. Se mantienen las alternativas como registro de la consulta, no como alcance adicional.

### 1. Acceso a investigación — confirmado: A
- A. Pestañas principales «Juego / Investigación» dentro de la app. **Recomendado.**
- B. Pantalla inicial que pide elegir entre ambos espacios.
- C. Botón en el menú actual que abre investigación a pantalla completa.
- D. Ruta independiente dentro del mismo sitio, sin selector permanente.

### 2. Inicio de un experimento — confirmado: C
- A. Siempre un escenario nuevo con valores por defecto.
- B. Siempre copiar el escenario de la partida actual, sin recompensas.
- C. Permitir elegir entre nuevo y copia independiente de la partida. **Recomendado.**
- D. Recuperar siempre el último experimento guardado.

### 3. Reglas de juego en investigación — confirmado: A
- A. Sin victoria/derrota ni barra de cura; conservar infección, intervenciones y recursos configurables. **Recomendado.**
- B. Sin victoria/derrota; conservar la cura como intervención opcional, definiendo su efecto.
- C. Conservar reglas de cura y presupuesto actuales; retirar solo minijuegos y campaña.
- D. Ofrecer una plantilla «experimental» y otra «reglas del juego».

### 4. Control del tiempo — confirmado: C
- A. Solo avanzar manualmente un día.
- B. Solo reproducción automática con pausa y velocidad.
- C. Ambas: paso diario y reproducción automática. **Recomendado.**
- D. Ejecutar hasta el horizonte y después reproducir los resultados.

### 5. Autonomía del agente — confirmado: A
- A. Propone y configura; requiere confirmación antes de aplicar medidas. **Recomendado.**
- B. Guarda medidas automáticamente, pero requiere confirmación para ejecutar.
- C. Puede crear, activar y ejecutar automáticamente dentro de límites.
- D. Ofrecer modo supervisado y autónomo elegibles por el usuario.

### 6. Configuración científica inicial — confirmado: B
- A. Solo parámetros actuales del escenario, con sus límites existentes.
- B. Parámetros actuales con panel avanzado y medidas dinámicas; no ecuaciones arbitrarias. **Recomendado.**
- C. Lo anterior y edición libre de ecuaciones en esta primera entrega.
- D. Priorizar importación de datos propios y escenarios desde archivos en esta primera entrega.

### 7. Guardado inicial — confirmado: B
- A. Solo durante la sesión; exportación manual.
- B. Guardado en este navegador más exportación/importación versionada. **Recomendado para comenzar sin nueva infraestructura.**
- C. Guardado privado en servidor, recuperable con identidad estable.
- D. Biblioteca compartida de experimentos para el equipo con permisos.

C y D requieren diseñar identidad/propiedad, costos y persistencia. Elegirlas no autoriza por sí solo desplegar ni gastar en AWS.

## 11. Siguiente paso

Selecciones registradas e implementación inicial disponible (ver IMPLEMENTATION.md). Reconciliar los contratos pendientes con Mateo y completar/revisar las tareas de: navegación/aislamiento, controlador experimental, esquema y compilador de medidas, panel dinámico, agente supervisado y persistencia local/importación. Proveedor/modelo identificado: OpenAI `gpt-6-luna`. Cerrar presupuesto/latencia del agente y semántica de copia antes de las tareas que dependan de ellos. No entregar otra demo independiente ni modificar las reglas del juego para simular este contexto.
