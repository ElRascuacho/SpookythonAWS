# Investigación — implementación local y operación

## Estado de esta entrega

Primera implementación funcional, no un demo mock. Publicación de código en main autorizada por el usuario; no se ha ejecutado un despliegue de recursos. No se hicieron llamadas de pago a OpenAI durante la verificación.

### Disponible

- Acceso Investigación en el menú superior existente del juego y regreso desde el encabezado de Investigación, sin barra de navegación adicional (ajuste solicitado por el usuario). Estados independientes: el mapa del juego permanece montado y su bucle visual se pausa al ocultarlo.
- Experimento nuevo o copia de los **parámetros iniciales** de la partida, sin estado epidemiológico actual, campaña, recursos extra ni recompensas.
- Controlador propio sin progreso de cura ni victoria/derrota. Usa el motor SEIR-V compartido.
- Parámetros de escenario básicos/avanzados, orígenes, horizonte 1–60 y semilla; validación estricta antes de ejecutar.
- Una trayectoria real congelada al preparar ejecución; avance diario, reproducción con pausa/velocidad y exploración de días. Preparar calcula toda la trayectoria; los controles recorren sus snapshots y la curva muestra solo el tramo observado.
- Mapa táctico 2D/3D a pantalla completa, usando el mismo encabezado/estilo del juego. Chat y editor plegables a la izquierda; inspector de zona a la derecha; métricas superiores y consola inferior con presupuesto, zona, línea temporal y medidas activas. Curva y archivo se abren bajo demanda, sin página/dashboard aparte.
- Cambio Juego/Investigación con fundido de 440 ms y retención del mapa saliente bajo el entrante para evitar oscurecimiento intermedio. Movimiento de paneles de 6–10 px con desaceleración de 560 ms, aparición escalonada de consola/métricas y cierre animado. Paneles, inspector, archivo y curva usan transiciones reversibles, sin reiniciar desde cero al interrumpirlas. Cambio de pestañas con fundido breve; sin rebotes ni filtros animados. Cámara compartida (posición, zoom, orientación e inclinación), sin compartir el estado epidemiológico. Se conserva el vuelo inicial original de main (1500 ms al abrir el juego); la sincronización no lo cancela al cargar ni lo repite al alternar secciones. Verificado en navegador midiendo posiciones proyectadas durante el vuelo, al estabilizar y tras ir/volver de Investigación. Ambos mapas permanecen montados para precargar recursos; solo el visible ejecuta su overlay. Se respeta movimiento reducido y el panel móvil se puede plegar.
- Esquema declarativo genérico: nombre libre, parámetros numéricos y horarios, zonas, calendario, condición por prevalencia, excepciones por corredor, costos por zona y efectos en contactos/movilidad. No hay catálogo de nombres de medidas ni código generado ejecutable.
- Creación/edición por OpenAI Responses API, modelo de servidor por defecto `gpt-6-luna`, con JSON estructurado validado, aclaraciones y confirmación humana antes de aplicar. Historial reciente enviado al modelo acotado a ocho mensajes.
- Controles generados desde la definición, hasta ocho medidas. Cada edición invalida confirmación; se conserva historial de hasta veinte confirmaciones por medida.
- Persistencia local validada, exportación/importación JSON versionada. Importar exige confirmar otra vez las medidas. Fallo de lectura local no sobrescribe el archivo automáticamente.
- Modificar configuración no altera una ejecución congelada. La UI indica cuándo se observa una revisión anterior.

### Límites explícitos

- El agente no inventa nuevos compartimentos, ecuaciones o fenómenos fuera del DSL. Vacunación/fumigación/cordones existentes se ejecutan mediante la política seleccionada; el DSL de esta entrega modifica contactos y movilidad. Otras capacidades requieren ampliación explícita.
- El perfil horario es uniforme. Dos intervalos de igual duración tienen el mismo factor individual; horarios solapados se componen por tramo antes de integrar.
- El costo declarado es por zona/día, no por hora. Si no alcanza, se omite la zona y no se cobra ni aplica efecto. Prioridad: orden de medidas en el selector y luego ID de zona. Un efecto de movilidad afecta corredores incidentes a una zona admitida, sin duplicarlo por sus dos extremos; excepciones tienen prioridad para esa medida.
- Se conserva la composición multiplicativa con cordones/acciones existentes. Son hipótesis educativas declaradas, no eficacia real calibrada.
- El registro local incluye configuración, versión de esquema y versión de protocolo `seir-research-v1`. No es todavía el bundle/hash/manifiesto acordado con Mateo ni permite afirmar compatibilidad con su buscador.
- Guardado en este navegador no es una cuenta privada ni almacenamiento cloud. No guardar datos clínicos/personales; borrar datos del navegador elimina los experimentos. La exportación contiene configuración y confirmaciones, no resultados ni transcripciones del chat.
- No se implementa evaluación masiva, CEM, promoción estadística, integración con la biblioteca de Mateo ni aprendizaje entre experimentos.
- Un resultado individual no prueba una mejora ni validez clínica. Se mantienen las etiquetas de modelo educativo no calibrado.

## Configurar OpenAI en desarrollo

En `.env.local` (no versionar):

```dotenv
OPENAI_API_KEY=tu_clave_del_servidor
OPENAI_RESEARCH_MODEL=gpt-6-luna
ENABLE_RESEARCH_AI=true
```

Reiniciar Vite tras cambiar entorno. Nunca usar prefijo `VITE_` para la clave ni enviar la clave desde el navegador. El endpoint no usa respuestas mock ni fallback de política: informa credenciales ausentes, proveedor no disponible, salida inválida o timeout.

```bash
bun run dev
```

Ingresar por el origen configurado en `INVITE_APP_ORIGIN` y elegir Investigación → Medidas / Agente. Crear una medida, revisar supuestos, confirmar, preparar ejecución y observar días. El origen debe coincidir exactamente para las peticiones autenticadas.

Si falta la clave o no se habilita la flag, aún se pueden configurar escenarios y ejecutar políticas existentes, importar definiciones válidas y confirmarlas; no se fingirá creación por IA. La disponibilidad de Luna en la cuenta y una llamada real de extremo a extremo siguen pendientes de comprobar con credenciales autorizadas.

## API y seguridad

`POST /api/research/agent`, detrás de la autenticación, comprobación de origen y Content-Type existentes.

Entrada: `message`, `current` (definición o null), `history` opcional con hasta ocho mensajes. Máximo 48 KB, mensaje 2000 caracteres. El agente no recibe datos futuros, semillas de réplica ni objetos de juego.

Salida: `reply`, `proposal` (definición o null) y modelo. El servidor valida esquema, referencias, rangos, nodos y corredores antes de devolver una propuesta. Cliente vuelve a validarla y rechaza respuestas si cambió la configuración durante la consulta.

Timeout proveedor 9 s; máximo 5000 tokens de salida; `store:false`. Cuatro intentos/IP/minuto **por proceso**; esto no es una cuota global ni un límite duro de factura. Antes de habilitar en un despliegue público se requiere controlar consumo distribuido y revisar la exposición de la cuenta demo pública. No habilitar sin autorización de gasto.

SAM añade ruta, modelo y flag (deshabilitada por defecto). No se desplegó. La API key comparte la configuración server-side existente del boletín; no se modifica el comportamiento de respaldo de noticias.

## Motor: compatibilidad y coordinación

El código real ya usa el **quinto argumento para `DifficultyGraph`**, aunque el plan de Mateo describía un quinto `options` sobre una revisión anterior. Se preservó esa firma y se añadió un **sexto argumento opcional** `SimulationExtensions.resolveDailyEffects`.

Sin resolver: mismo motor y resultados. Con resolver: antes de decidir se calculan medidas/costos contra una copia del estado disponible, se asigna remanente a la política y se aplican factores dentro de transmisión local/importada. Las trazas viajan en `DailyCitySnapshot.researchEffects`.

El modo experimental rechaza combinar su resolver con acciones manuales/recompensas o grafo sintético. Juego, campaña y dificultad conservan sus llamadas anteriores. Acordar con Mateo la evolución común de esta firma antes de integrar su seam; no aplicar su tarea T1 literalmente sobre el motor nuevo.

## Pruebas

```bash
bun run build
bun test src/domain/__tests__/research.test.ts backend/__tests__/researchAgent.test.ts
```

Pruebas nuevas: validación y rechazo de código/capacidades desconocidas, integración de medianoche/solapamientos, costos y omisiones, efectos SEIR reales, conservación de población/presupuesto, reproducibilidad, paridad sin extensión, importación, contrato de Responses API y errores honestos del proveedor. Las respuestas simuladas del proveedor existen solo en las pruebas.

Verificado adicionalmente con Playwright/Chromium temporal: login de desarrollo, navegación, copia de parámetros, ejecución/avance, importación y confirmación, cobro real de medidas en snapshots, retorno al juego, guardado/recarga, respuesta explícita de agente deshabilitado y móvil 390 px sin desbordamiento ni errores JavaScript. Tras rediseño: mapa ocupa exactamente el viewport, chat/editor izquierdo plegable, panel de evolución bajo demanda, escenario y archivo accesibles, ejecución conservada al regresar, continuidad de vista 2D entre ambos modos y preferencia de movimiento reducido. No equivale a una prueba pagada contra OpenAI.

Build aprobado. La suite sin `robustness.test.ts` terminó con **152 pruebas aprobadas, 0 fallidas, en 29 archivos**. La ejecución completa se interrumpió por timeout; la prueba preexistente `robustness.test.ts` también agotó su límite propio de 30 s al ejecutarla aislada en este entorno. No se modificó su timeout ni se declara la suite completa aprobada.
