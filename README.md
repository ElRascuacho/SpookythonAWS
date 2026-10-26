# Manta Cero — Encuentra la cura

Demo jugable para navegador de **Operación Manta Cero**, Track B: La Plaga Zombie. Eres el comité de respuesta de Manta: distribuye recursos entre contención e investigación para encontrar la cura antes de que el brote desborde la ciudad.

## Ejecutar

```bash
bun install
bun run dev
# http://localhost:5173
bun test
bun run build
bun run preview
```

## Cómo jugar

1. Selecciona una de las 16 zonas del mapa.
2. Asigna vacunación ($200), fumigación ($250) o cordón sanitario ($300). Las brigadas se pueden retirar antes de ejecutar y se reasignan cada día.
3. Financia investigación: $250 suma 3 puntos porcentuales diarios; $500 suma 5; $0 pausa. La misma bolsa diaria financia investigación y brigadas.
4. Pulsa **Avanzar un día**. El presupuesto se renueva sin acumular sobrantes.
5. Ganas al completar el 100% de investigación. Pierdes si los contagios acumulados alcanzan el 35% de la población, o al terminar el día 40 sin cura. El umbral de contagios tiene prioridad si coincide con la validación de la cura.

**Una estrategia ganadora verificada:** escenario estándar, semilla `20261030`, $1.000/día; invierte $500 en investigación y envía cada día un cordón y una brigada de vacunación al nodo con más infecciosos (no vacunes si ya no quedan susceptibles). Completa la cura el día 20. No se garantiza victoria en todas las semillas/escenarios.

**Nueva misión** permite cambiar semilla, origen, presupuesto ($500/$1.000/$1.500) y escenario: estándar, doble contagio humano o escape de vacuna. Reiniciar o recargar descarta la partida: esta demo no guarda progreso.

## Evaluación reproducible

**Evaluar** ejecuta localmente 20 corridas por estrategia hasta el día actual: tu calendario de brigadas, no intervenir, intervención al azar y SGC automática. Reporta promedios y percentiles P10–P90, sin declarar de antemano un ganador. Las líneas base disponen del mismo presupuesto diario; tu plan dedica parte a investigación y ellas solo a contención. Todas empiezan sin intervenciones en el día cero.

La evaluación de tu plan repite el calendario ya elegido; no representa una política adaptativa que tome nuevas decisiones en cada réplica. La gráfica contiene las tres estrategias automáticas, mientras tu plan se muestra en su tarjeta. Los percentiles son dispersión entre corridas, **no intervalos de confianza**. Contagios evitados **no son muertes evitadas**.

## Modelo, parámetros y supuestos

- Modelo ficticio educativo SEIR: susceptible, expuesto, infeccioso y recuperado/inmune; la vacuna solo se aplica a susceptibles. `R` incluye tanto recuperación como inmunización. No hay mortalidad modelada.
- Grafo manual de 16 zonas y 22 conexiones inspirado en Manta. Poblaciones, pesos, centralidades y riesgos son aproximaciones de escenario, **no datos epidemiológicos calibrados ni rutas oficiales verificadas**. El mapa SVG es esquemático; los edificios son decoración generada, no cartografía real.
- Juego estándar: `betaHuman=0.30`, `betaVector=0.045`, `sigma=0.33`, `gamma=0.10`, eficacia vacuna `0.85`, capacidad hospitalaria `2500`, lote `850`, $1.000/día, origen `N01`, 35 infecciosos y 50 expuestos iniciales, semilla `20261030`.
- Doble contagio: `betaHuman=0.60`; escape inmune: eficacia `0.45`. Las demás condiciones permanecen iguales.
- Fumigación reduce el vector ambiental 80% (luego puede recuperarse); cordón reduce transporte 92% y contacto local 55% durante ese turno.
- Investigación lineal, costos, plazo de 40 días y umbral de 35% son **reglas de diseño del juego**, no predicciones científicas. Al validar la cura termina la misión; no se simula su distribución posterior.
- PRNG Mulberry32 y transiciones binomiales (aproximación normal para grupos grandes). Misma configuración, semilla y decisiones producen la misma partida.
- Fuente de los requisitos: [`Hackathon Track B - Guia Oficial y Requisitos.pdf`](./Hackathon%20Track%20B%20-%20Guia%20Oficial%20y%20Requisitos.pdf), documento local de tres páginas. No respalda una fecha límite de entrega ni una región AWS concreta.

## Estructura

- `src/App.tsx` — interfaz, presupuesto, decisiones, tutorial, escenarios y comparación.
- `src/components/CureCityMap.tsx` — mapa SVG interactivo, capas y zoom; no requiere servicios de mapas externos.
- `src/domain/cureGame.ts` — reglas y validación del juego; reutiliza el motor SEIR.
- `src/domain/seirEngine.ts` — simulación compartida y calendario opcional de acciones manuales.
- `src/domain/monteCarlo.ts` — baselines y agregación; la demo calcula solo al pedir evaluación.
- `src/domain/__tests__/` — reproducibilidad, recursos, conservación de población, victoria/derrota y contratos existentes.
- `backend/handler.ts`, `infra/template.yaml` — prototipo previo del backend, no utilizado por el juego local.

## Estado de entrega AWS

Esta entrega es **frontend local**, sin autenticación, persistencia, llamadas a Bedrock ni evidencia de despliegue AWS. `bun run build` genera el sitio estático en `dist/`, listo para una siguiente fase de publicación. No publica automáticamente ni genera el artefacto Lambda esperado por la plantilla SAM.

Pendientes para la entrega del reto: hosting público AWS, Budget con alerta y captura, diagrama exportado y fuente actualizados, costos reales verificados y pitch. [Arquitectura Pro propuesta](docs/04-arquitectura-aws-y-costos.md) y [costos históricos del borrador](docs/costos.md) son documentación de trabajo, no evidencia de servicios operativos ni facturación validada.
