# Primer día guiado

## Recorrido

La primera visita del navegador abre una práctica guiada de cuatro pasos:

1. Elegir una zona.
2. Asignar prevención comunitaria.
3. Financiar el laboratorio.
4. Revisar y avanzar un día de práctica.

La práctica se realiza sobre el mapa, el selector de zona, la ventana de intervenciones, el laboratorio y el botón de avance reales. No hay tarjetas que simulen esos controles ni botones «Continuar»: realizar cada acción correcta avanza automáticamente la guía. El control relevante queda resaltado y «Llévame al control» desplaza y enfoca su destino. En prevención, «Abrir intervenciones» recupera la ventana si se cerró. Las acciones que no corresponden al paso quedan deshabilitadas, sin bloquear el control de música.

Las capturas anteriores siguen disponibles como referencia opcional desplegable con texto alternativo. **Saltar tutorial**, en la bienvenida y durante los pasos de la primera visita, entra directamente al juego y recuerda la elección. En repeticiones, «Cerrar guía» permite salir. No hay reloj ni penalizaciones.

El motor y el presupuesto son los del juego, pero la práctica usa un `TutorialState` independiente. `App` conserva el estado del jugador y proyecta temporalmente los valores de práctica sobre la misma interfaz. Las acciones de entrenamiento se despachan al reducer del tutorial, no a los setters del jugador. Al salir se conservan día, zona, inversión, presupuesto y órdenes pendientes. El avance de práctica no solicita noticias ni recompensa operaciones; tampoco publica parámetros de práctica a Investigación. Al completar se muestran resultados y orientación sobre las funciones restantes.

## Recorridos con spotlight (Driver.js)

La bienvenida de **Cómo jugar** ofrece además **Recorrer la interfaz del juego**. Conserva la práctica nativa de cuatro acciones del equipo y añade un recorrido estricto de cinco acciones: seleccionar zona, financiar cura, abrir operación, ganar **Perímetro cero** (disparos, ocho objetivos) y ejecutar el turno. No hay «Siguiente» ni atajos para saltar validaciones. Mientras se juega, el diálogo de campo sustituye al spotlight y explica controles, reintento y motivo del bloqueo. Ganar aplica la recompensa real; después se retoma el foco sobre el avance. Se usa el motor real en una práctica temporal y se restaura la partida, órdenes, inversión, zona y operación pendiente originales tanto al terminar como al salir. No se publican parámetros de práctica a Investigación ni se solicitan noticias. Escape y el cierre funcionan incluso antes de terminar la animación inicial; salir no acredita la finalización del recorrido.

**Bloqueo del día en juego:** una operación elegible pendiente deshabilita «Avanzar un día» y el controlador también comprueba la condición antes de llamar al motor. Un aviso explica que la operación/recompensa corresponden al turno actual y ofrece **Realizar minijuego**. Cerrar la ventana o perder conserva el bloqueo: hay que reintentar y ganar. Se desbloquea al registrar la recompensa real, no al abrir o cerrar el diálogo. Los estados sin operación elegible, con recompensa ya registrada o de partida terminada no crean un bloqueo adicional. Se aplica a disparos, parkour y laboratorio; no afecta al motor científico independiente de Investigación.

### Investigación

La bienvenida científica (primera visita o botón **ⓘ Información de Investigación**) incluye **Iniciar recorrido guiado**. Seis acciones sobre controles reales: abrir Escenario, abrir Agente, hacer clic/tocar el cuadro de consulta (o pulsar Enter con teclado, sin escribir ni enviar), abrir Evolución, abrir Archivo y exportar el JSON validado real. Durante el tour Enter **no envía** al agente y la voz queda desactivada; no se lanzan simulaciones, comparaciones ni llamadas pagadas. La navegación y la entrada del compositor se restauran al salir; no se altera la configuración, medidas, confirmaciones ni resultados. Se pausa la reproducción mientras dura el recorrido. Se explica que ejecución/comparación son manuales, que los resultados son exploratorios y que las propuestas requieren revisión humana.

La descarga requiere una configuración válida; un error no completa el paso. Cancelar no escribe finalización. Completar registra `manta-cero:research-tour:completed:v1=1` como preferencia local, no autenticación ni certificación por cuenta. Se puede repetir desde la bienvenida. Ambos recorridos admiten teclado, salida explícita, móvil y movimiento reducido.

Verificación de esta ampliación: build, suite unitaria y Chromium con controles reales, victoria de ocho objetivos por eventos de puntero/teclado (sin inyectar recompensas), cierre/reapertura pendiente, restauración de operación original, exportación JSON, avance por clic/toque o Enter en el cuadro de consulta (sin avance por foco automático), cancelación temprana durante la animación, móvil y movimiento reducido. Sin llamadas pagadas ni despliegue de infraestructura.

## Persistencia

- Al pulsar **Volver a mi partida** al terminar o **Saltar tutorial**, se guarda `manta_cero_tutorial=2`, durante un año, `Path=/`, `SameSite=Lax` y `Secure` en HTTPS. El marcador representa que el usuario terminó o decidió omitir la guía, no que necesariamente completó la práctica.
- Respaldo independiente: `localStorage["manta-cero:tutorial:completed:v2"] = "2"`.
- Una cookie o un marcador local válido evita la apertura automática. El antiguo marcador `manta-cero:tutorial:v1` solo significaba «visto» y no cuenta como una decisión sobre esta guía.
- Recargar una práctica incompleta sin elegir saltarla no guarda la decisión. Al recargar se empieza de nuevo.
- Si ambas persistencias están bloqueadas, terminar desbloquea la sesión actual; al recargar será necesario repetirla.
- **Cómo jugar** permite repetir la guía y cerrarla libremente después de completarla o saltarla.

Esto es una preferencia de navegador, sin datos personales; no identifica cuentas ni es un control de seguridad. Otro navegador o borrar ambos marcadores vuelve a exigir la práctica. Usuarios que comparten navegador también comparten esta preferencia. Una obligación por cuenta requeriría persistencia en el perfil del servidor.

## Capturas

`public/tutorial/01-zona.png` a `04-turno.png`: capturas de la interfaz real de desarrollo, con una partida de ejemplo y contornos añadidos al DOM para destacar los controles. No contienen credenciales ni datos de una partida de usuario. Deben actualizarse si cambia la ubicación o el aspecto de esos controles.

## Verificación

- `bun test`: 255 pruebas pasan; una prueba nueva recorre los eventos de los controles reales, rechaza interacciones fuera de orden y verifica que el motor avance exactamente una vez. Se mantienen las pruebas de persistencia y de separación de partidas.
- `bun run build`: correcto.
- Chromium, app real con respuesta de sesión simulada, escritorio y 390 px: selector real, ventana de intervención reabrible, prevención real, inversión real y avance; acciones fuera de orden deshabilitadas, foco al control, cookie al terminar, práctica de un día y conservación de partida. Una segunda práctica con otra zona/inversión conserva exactamente el texto de la barra del jugador, incluidos inversión, presupuesto y órdenes pendientes, tanto al terminar como al cerrar anticipadamente.
- No se verificaron lectores de pantalla reales ni otros navegadores. La persistencia no se ha migrado a perfiles de servidor.
