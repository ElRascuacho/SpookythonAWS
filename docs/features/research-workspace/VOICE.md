# Voz de Investigación — conversación nativa al estilo Midas / TAWS

## Arquitectura actual

Referencia de lectura (sin modificar TAWS): `taws-frontend/src/app/features/realtime/infrastructure/realtime-webrtc.service.ts`, `presentation/voice-mode-overlay.component.{html,scss,ts}` y `taws-backend/src/app/infrastructure/realtime/openai_realtime_session_provider.py`.

Se adapta el esquema de conversación de Midas: WebRTC, credencial efímera, conversación Realtime, transcripciones, llamadas a herramientas, continuación después de entregar resultados y límite de herramientas. La UI de voz se integra exclusivamente dentro del chat de Investigación, sin copiar el overlay de Midas. No se copian Angular, Supabase ni herramientas financieras.

**Ya no es transcripción → Terra en cada turno → lectura literal de la respuesta.** Realtime conversa directamente en español, con memoria dentro de la sesión, respuestas breves y herramientas:

- `get_research_context`: lectura del contexto local vigente: parámetros editables y de la ejecución congelada, instantánea del día observado y propuesta seleccionada. Nunca devuelve la trayectoria futura ni ejecuta acciones.
- `propose_measure`: pide al mismo endpoint Terra una propuesta/revisión estructurada. Conserva clasificación de pertinencia, validación, protección frente a cambios simultáneos y confirmación manual. Solo una llamada de propuesta por intervención del usuario; hasta tres llamadas de herramienta en total por intervención. No hay herramientas de confirmar, aplicar, eliminar ni avanzar días.

Una respuesta conversacional normal no espera a Terra. Su texto y el del usuario se reflejan en el chat habitual. La narración es voz nativa generada por Realtime, no TTS del navegador ni reproducción de un mock. Las respuestas habladas directas no pasan por el clasificador de Terra: su alcance educativo se establece por instrucciones del modelo, no es una garantía semántica absoluta. Las propuestas sí conservan la validación estricta del agente existente.

## Interrupciones y ciclo de vida

- Detección semántica de turnos (`semantic_vad`, `eagerness: medium`) y respuesta/interrupción automáticas. La pista de micrófono permanece abierta durante la reproducción; cancelación de eco, reducción de ruido y control automático de ganancia solicitados al navegador. Probar altavoces y auriculares: la calidad depende del dispositivo/entorno.
- En WebRTC el servidor administra el audio y trunca automáticamente lo no reproducido al detectar una interrupción. No se calcula `audio_end_ms` con un reloj de pared. Referencia: https://developers.openai.com/api/docs/guides/realtime-conversations . El botón Interrumpir conserva cancelación explícita y vaciado del buffer.
- Hablar de nuevo cancela consultas de herramienta pendientes y descarta resultados/transcripciones tardíos de respuestas canceladas. No implica revertir una propuesta que ya se haya entregado; nunca la confirma.
- La continuación de herramientas espera que la respuesta anterior haya terminado: no envía `response.create` mientras otra respuesta sigue activa.
- Finalizar, Escape, cerrar, cambiar sección/pestaña, ocultar documento o desmontar liberan micrófono, conexión, reproducción, AudioContext, RAF y temporizadores. Un permiso concedido después de cancelar no deja una captura activa.
- La memoria conversacional Realtime dura la sesión; no se persiste audio ni se promete memoria de sesiones anteriores. El chat local recibe transcripciones finales, no se exporta con el experimento.

## Experiencia visual

Tarjeta compacta dentro del compositor del chat del agente, con estados de conexión/escucha/procesamiento/habla/error, onda de barras fina y naranja, vista breve de la respuesta en curso y controles de finalizar/interrumpir. Aparece desde el clic, incluso durante el permiso, y se retira suavemente al terminar. No hay esfera, órbitas, portal, modal, backdrop ni bloqueo del mapa; el historial sigue en el chat habitual.

Un analizador Web Audio lee amplitud real de micrófono y audio remoto para modular las barras; no conecta el micrófono a altavoces. En conexión/procesamiento se usa una señal suave de espera, no una falsa medición de volumen. Los fotogramas actualizan una variable CSS directamente, no el estado del mapa. Se respeta movimiento reducido, teclado y Escape desde los controles de voz, con devolución del foco al botón Hablar y sin atrapar el foco.

## Activación y costos

```dotenv
ENABLE_RESEARCH_VOICE=true
OPENAI_RESEARCH_VOICE_MODEL=gpt-realtime-2.1-mini
OPENAI_RESEARCH_VOICE=alloy
```

La voz local fue habilitada a petición del usuario. SAM continúa deshabilitado por defecto. Requiere también `ENABLE_RESEARCH_AI=true`, HTTPS/localhost, WebRTC y clave con acceso al modelo. `OPENAI_RESEARCH_VOICE_API_KEY` es opcional; de no existir se reutiliza `OPENAI_API_KEY`. Nunca usar prefijo `VITE_` para claves. Reiniciar Vite tras cambiar configuración/backend.

Audio/transcripción se transmiten a OpenAI; no es reconocimiento offline. Realtime tiene consumo adicional y Terra factura cuando se invoca la herramienta. No se promete menor costo. No se hicieron llamadas pagadas para verificar este cambio. No se desplegó TURN, relay alternativo ni infraestructura cloud.

## Límites y seguridad

- Credencial efímera: 60 segundos para señalizar; su expiración no termina una conexión abierta. La clave facturable nunca llega al navegador.
- Sesión UI: máximo tres minutos, implementado por cliente. **No es una cuota resistente a manipulación.**
- Emisión: dos intentos/IP/minuto por proceso. Las propuestas conservan cuatro consultas/IP/minuto del agente; ya no se cobra ese cupo por conversación general.
- Endpoint autenticado, con controles de origen/Content-Type del router. Rechaza configuración del navegador. Los manejadores solo admiten los dos nombres/argumentos declarados; no ejecutan código generado.
- La credencial efímera permite que un cliente modificado altere su sesión. Antes de habilitar públicamente: cuotas distribuidas/gasto, revisar acceso demo y control server-side de sesiones. Ni límites de UI ni prompt son barreras de facturación.

## Validación del cambio

- Build correcto y pruebas unitarias del agente, dominio, sesión backend y transporte nativo (proveedores simulados).
- Playwright con WebRTC/micrófono/API simulados: conversación sin llamadas a Terra, transcripción incremental, micrófono abierto, interrupción y descarte de respuestas canceladas, herramientas y continuación en orden, propuesta sin confirmar, tarjeta inline desktop/mobile sin modal/esfera/desbordamiento, Escape, movimiento reducido, permiso tardío y permiso denegado. Sin llamadas pagadas.
- Pendiente: prueba manual con micrófono/altavoces reales del nuevo flujo, latencia y detección semántica, eco, calidad audible y compatibilidad del modelo en la cuenta. El usuario confirmó que el flujo de voz anterior funcionaba; eso no sustituye esta prueba nueva.
