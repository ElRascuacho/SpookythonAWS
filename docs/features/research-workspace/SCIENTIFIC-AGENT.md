# Agente científico y bienvenida de Investigación

## Capacidades implementadas

- Primera entrada: `ResearchWelcome` explica el enfoque 100% orientado a simulación científica educativa, hipótesis, controles, conversación, comparaciones y ausencia de competición. Aclara que el modelo no está calibrado ni clínicamente validado. Modal nativo centrado, foco accesible, Escape/cierre, movimiento reducido y diseño móvil. No abre el micrófono ni llama al proveedor. Se recuerda al cerrar con `manta-cero:research-welcome:v1`; sin almacenamiento funciona solo durante el montaje/sesión. Es por navegador, no por cuenta. El botón **ⓘ Información de Investigación**, en la barra superior junto a Volver al juego, permite abrirlo de nuevo sin borrar datos ni reactivar la aparición automática. Escape/cierre devuelven el foco al botón; funciona en escritorio y móvil. Para restablecer la primera visita en desarrollo, eliminar exclusivamente esa clave.
- Contexto compartido y validado (`ResearchContextSchema`) para texto y voz: parámetros editables, parámetros de ejecución congelada, estado agregado del día observado, propuesta seleccionada, revisiones/confirmaciones, evidencia y última consulta del Comité. No incluye trayectoria futura. Los resúmenes de evaluación completa se distinguen del playback observado.
- Terra deja de afirmar que nunca recibe contexto: lo usa si existe y pide datos si falta. Contexto sigue siendo información del simulador local aportada por cliente, no evidencia clínica autenticada ni instrucciones de sistema. El contrato mantiene compatibilidad con clientes sin contexto y rechaza campos desconocidos.
- Panel plegable **Evidencia y evaluación** dentro del historial del agente, sin dashboard adicional ni cambios al mapa. Sugerir variantes solo prepara el texto del compositor; no lo envía ni revisa/ejecuta automáticamente.

## Evaluación emparejada

El botón **Evaluar medidas confirmadas** autoriza explícitamente 16 o 32 pares de trayectorias en un Web Worker local; no usa OpenAI, Lambda ni inicia un job del Comité. El worker usa el mismo motor compartido, no copia ecuaciones ni implementa otro buscador CEM.

Cada par usa idénticos parámetros iniciales, horizonte, presupuesto máximo, estrategia, semilla y runIndex, con namespace ambiental `research-paired-v1`. Baseline: política seleccionada sin medidas. Candidata: misma política más todas las medidas activas confirmadas. El motor descuenta sus costos antes de asignar el remanente a la política. No es una comparación contra ausencia total de intervención salvo que esa sea la estrategia elegida. No importa automáticamente pesos de candidatas del Comité.

Requiere al menos una medida activa y confirma tanto revisión como igualdad de definición confirmada/editable. Réplicas acotadas; cancelar, cambiar configuración, salir o desmontar termina el worker y descarta resultados tardíos. La configuración no se modifica durante una evaluación.

Se muestran medias de contagios acumulados, pico de infecciosos, días de colapso y gasto simulado; diferencia de contagios candidata − baseline e intervalo percentil bootstrap emparejado al 95% (1000 remuestreos deterministas). Negativo favorece a la candidata. **Es exploratorio**, sin corrección de comparaciones múltiples ni garantía de eficacia; no sustituye promoción, selección separada o auditoría final del Comité. La misma semilla inicial no garantiza que todos los eventos posteriores coincidan si las intervenciones cambian el consumo del RNG.

## Identidad y evidencia

La ficha contiene `protocol: research-paired-v1`, fecha, 16/32 réplicas, métricas y configuración congelada. SHA-256 de representación canónica incluye motor, grafo (`manta-v1`), orden de presupuesto, parámetros completos (incluida semilla/horizonte), estrategia y definiciones/revisiones/activación de medidas ordenadas por ID. Excluye historial de confirmación para evitar invalidación por bookkeeping. Si cambian semánticas del motor/grafo/protocolo, sus versiones deben incrementarse coordinadamente.

Cualquier edición científica o cambio de revisión/activación invalida la correspondencia. La verificación síncrona de identidad en el contexto del padre evita enviar `evidenceCurrent:true` durante la ventana anterior al nuevo hash asíncrono. La evidencia anterior se conserva claramente etiquetada, no se reetiqueta como evaluación de la nueva medida.

Solo la última ficha se guarda en `manta-cero:research-evidence:v1`, separada del workspace. **Exportar evidencia y configuración** descarga JSON validado con el experimento congelado. No hay importación automática de resultados, persistencia cloud, firma de autenticidad ni historial ilimitado. Al agente se envía el resumen acotado, no la copia completa del experimento. El almacenamiento local no es aislamiento por cuenta ni evidencia antifraude; los hashes identifican configuración, no certifican resultados.

## Comité: integración de solo lectura

El usuario introduce un jobId existente y pulsa **Consultar / actualizar Comité**. Se usa el endpoint autenticado y su autorización por propietario; no se inicia búsqueda ni se cambia su contrato. Se valida el resumen y se rechazan IDs distintos o revisiones anteriores del mismo job. Se registra fecha de consulta; el agente debe hablar de esa última observación, no inventar progreso actual.

Se diferencian candidata, versión recomendada y `finalAudit`. `not-run` no es aprobación. Los jobs actuales no reciben nuestras medidas: sus resultados nunca se atribuyen al efecto de esas medidas. La evaluación local añade un puente de comparación utilizable hoy, **no afirma integrar la DSL en el worker CEM**. Ese contrato, admisión/costo, biblioteca y manifiestos compartidos siguen requiriendo coordinación con el equipo.

## Verificación

- Build correcto. 252 pruebas aprobadas en 43 archivos, excluyendo `robustness.test.ts` y con timeout de ejecución de 20 s para pruebas pesadas.
- Pruebas nuevas: identidad estable y cambios científicos, confirmación ausente/desfasada/alterada, límites de réplica, paridad exacta con efecto/costo cero, reproducibilidad y costos reales, contexto acotado y rechazo de trayectoria/campos no permitidos, recepción del contexto en backend.
- Playwright: bienvenida inicial desktop/móvil, centrado y no repetición tras recarga; evaluación con **worker/motor reales** usando fixture; persistencia, contexto sin trayectoria futura, consulta Comité con respuesta interceptada, sugerencias sin envío automático e invalidación de evidencia tras editar. Regresión de voz inline con WebRTC/proveedor simulados. Sin llamadas pagadas.
