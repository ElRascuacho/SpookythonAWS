# Primer día guiado

## Recorrido

La primera visita del navegador exige completar una práctica de cuatro pasos:

1. Elegir una zona.
2. Asignar prevención comunitaria.
3. Financiar el laboratorio.
4. Revisar y avanzar un día de práctica.

Cada paso muestra una captura real de la interfaz con el objetivo destacado, una explicación breve y una acción obligatoria de práctica. Las capturas se pueden ampliar en otra pestaña y tienen texto alternativo. El cierre, Escape, fondo y omisión no permiten saltar la primera práctica. Se puede retroceder sin perder las decisiones; no hay reloj ni penalizaciones.

El motor y el presupuesto son los del juego, pero la práctica usa una partida independiente. Al completar se muestran resultados y una orientación sobre mapa, brigadas, comparativas, agente, campaña y operaciones. La partida real sigue en su estado original.

## Persistencia

- Al pulsar **Completar y empezar a jugar**, se guarda `manta_cero_tutorial=2`, durante un año, `Path=/`, `SameSite=Lax` y `Secure` en HTTPS.
- Respaldo independiente: `localStorage["manta-cero:tutorial:completed:v2"] = "2"`.
- Una cookie o un marcador local válido evita repetir la obligación. El antiguo marcador `manta-cero:tutorial:v1` solo significaba «visto» y no cuenta como completado.
- Cerrar o recargar una práctica incompleta no guarda la finalización. Al recargar se empieza de nuevo.
- Si ambas persistencias están bloqueadas, terminar desbloquea la sesión actual; al recargar será necesario repetirla.
- **Cómo jugar** permite repetir la guía y cerrarla libremente después de completar la primera práctica.

Esto es una preferencia de navegador, sin datos personales; no identifica cuentas ni es un control de seguridad. Otro navegador o borrar ambos marcadores vuelve a exigir la práctica. Usuarios que comparten navegador también comparten esta preferencia. Una obligación por cuenta requeriría persistencia en el perfil del servidor.

## Capturas

`public/tutorial/01-zona.png` a `04-turno.png`: capturas de la interfaz real de desarrollo, con una partida de ejemplo y contornos añadidos al DOM para destacar los controles. No contienen credenciales ni datos de una partida de usuario. Deben actualizarse si cambia la ubicación o el aspecto de esos controles.

## Verificación

- `bun test`: 254 pruebas pasan; cuatro nuevas prueban versión exacta, marcador antiguo, persistencias bloqueadas/independientes y bienvenida obligatoria/opcional. Las pruebas existentes cubren las acciones requeridas, el motor y la separación de partidas.
- `bun run build`: correcto.
- Chromium, app real con respuesta de sesión simulada: primera visita y marcador antiguo, Escape/fondo, recarga incompleta, cuatro acciones y capturas cargadas, reflujo a 390 px, partida real en día 00, cookie y almacenamiento al completar, recarga sin bloqueo, repetición opcional y persistencias independientes.
- No se verificaron lectores de pantalla reales ni otros navegadores. La persistencia no se ha migrado a perfiles de servidor.
