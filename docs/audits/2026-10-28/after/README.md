# Verificación posterior a las correcciones

## Alcance

[Seguro] Se conservó el informe original como evidencia histórica. Las correcciones locales cubren A01–A10; los riesgos de rendimiento R01/R02 no se consideran resueltos ni medidos.

| Hallazgo | Corrección implementada |
|---|---|
| A01 | Instrucciones y botón del arcade en flujo, sin limitar su altura al canvas. |
| A02 | Disposición en flujo para pantallas de poca altura, incluida la noticia. |
| A03 | Selector nativo de día utilizable con teclado. |
| A04 | Foco explícito en el resultado del laboratorio; fondo inerte y contención del foco en el diálogo. |
| A05 | SVG con ancho mínimo de 760 px y desplazamiento; etiquetas mayores y tarjetas en una columna móvil. |
| A06 | Cámara móvil separada del grupo de capas. |
| A07 | Retorno de foco al cerrar operaciones; foco al entrar y volver de Investigación. |
| A08 | Conversación con `role="log"` y anuncios de nuevas entradas; estado de consulta separado. |
| A09 | Token de borde de controles contrastado con las superficies de formulario. |
| A10 | Botones de movimiento y salto con liberación por fin/cancelación de puntero. |

## Validación automatizada repetida al retomar la sesión

- [Seguro] `bun test`: **233 pruebas, 0 fallos**, incluidas cuatro pruebas nuevas de contratos de accesibilidad. Estas últimas verifican markup SSR y contraste; no simulan un lector de pantalla.
- [Seguro] `bun run build`: correcto. Persisten advertencias de anotaciones de Zod y tamaño de chunks, no errores de compilación.
- [Seguro] `git diff --check`: correcto.
- [Seguro] Chromium headless, viewport 390×844, componentes reales servidos por Vite en un harness aislado:
  - Laboratorio: resolver con pistas y activar «Sintetizar cura» con Enter deja el foco en el resultado. Se usó un callback de recompensa simulado, sin modificar una partida del usuario.
  - `WorkspaceShell`: entrar a Investigación con Enter enfoca su contenedor; volver restaura el foco al botón Investigación.
  - Diálogo «Nueva misión»: fondo `inert`, intento de foco programático al fondo contenido, Shift+Tab dentro del diálogo y Escape con restauración al disparador y retirada de `inert`.

## Evidencia visual conservada de la sesión anterior

- [Inicio de arcade móvil](01-arcade-mobile.jpg).
- [Parkour con controles táctiles](02-parkour-touch.jpg).
- [Noticias en horizontal](03-landscape-news.jpg).
- [Comparativa móvil](04-chart-mobile.jpg).

[Seguro] La sesión anterior registró pruebas de movimiento/liberación táctil emulados, acceso a Protección a 320 px y lectura/cierre de noticia con teclado en horizontal. Esas pruebas no se repitieron en esta reanudación.

[Resultado de laboratorio enfocado, componente aislado en esta reanudación](05-lab-focus.jpg).

## Límites

[Seguro] No se probaron NVDA/JAWS/VoiceOver, hardware táctil real, todos los estados de contraste, zoom de texto al 200% ni colores forzados. Las pruebas disponibles no acreditan conformidad WCAG ni accesibilidad no visual completa de los arcades. Los cambios permanecen locales, sin commit ni push en esta reanudación.
