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
