# 🧟‍♂️ Operación Manta Cero — Spookython AWS (Track B: El Brote)

**Simulación Epidemiológica 3D Estocástica SEIR-V sobre el Grafo Urbano de Manta (`G = (V, E)`) con Motor Monte Carlo Reproducible y Estrategia *Smart Graph Cortafuegos (SGC)*.**

---

## 🚀 Inicio Rápido (100% con `bun`)

```bash
# 1. Instalar dependencias
bun install

# 2. Ejecutar suite de pruebas unitarias (Reproducibilidad, Regla de Oro S-only y Superioridad SGC)
bun test

# 3. Levantar el Centro de Mando 3D en desarrollo
bun run dev

# 4. Compilar para producción (S3 + CloudFront / Amplify)
bun run build
```

---

## 🏛️ Estructura del Proyecto

- [`src/domain/types.ts`](./src/domain/types.ts): Contratos de datos del grafo, compartimentos `S-E-I-R-V`, parámetros del Brote Sorpresa y resultados Monte Carlo (`P10`, `Media`, `P90`).
- [`src/domain/prng.ts`](./src/domain/prng.ts): Generador pseudoaleatorio determinista `Mulberry32` + muestreador Binomial reproducible por `(seed, strategy, runIndex)`.
- [`src/domain/mantaGraph.ts`](./src/domain/mantaGraph.ts): Topología real de **16 Nodos Estratégicos de Manta** (`N01` Mercado Central de Tarqui hasta `N16` Urbirríos, `270,000` habitantes) y **22 Aristas de Corredores Urbanos FETUM**.
- [`src/domain/seirEngine.ts`](./src/domain/seirEngine.ts): Motor de transición diaria SEIR-V con foco vectorial ambiental (*Necro-Dengue*), umbral de saturación del **Hospital Rodríguez Zambrano** y cumplimiento matemático de **0 dosis desperdiciadas en `E/I/R`**.
- [`src/domain/strategies.ts`](./src/domain/strategies.ts): Implementación de las 3 estrategias exigidas por la rúbrica:
  1. **🔴 Línea Base 1 (`NO_INTERVENTION`):** Sin intervención municipal.
  2. **🟡 Línea Base 2 (`RANDOM`):** Asignación aleatoria del mismo presupuesto diario.
  3. **🟢 Nuestra Estrategia (`SMART_CORTAFUEGOS`):** Optimización por **Ratio de Contención por Dólar (RCD)** ponderado por *Betweenness Centrality*, presión infecciosa a 2 saltos y cerco temprano al Paciente Cero.
- [`src/components/MantaCity3DMap.tsx`](./src/components/MantaCity3DMap.tsx): Escena 3D interactiva en `MapLibre GL JS` con extrusión de edificios de Manta, torres 3D dinámicas por nodo, halos de foco vectorial y selector de Paciente Cero con un clic.
- [`src/components/SurpriseOutbreakPanel.tsx`](./src/components/SurpriseOutbreakPanel.tsx): Panel **"🎃 Modo Brote Sorpresa (Jurado)"** con presets de 1 clic y controles en vivo.
- [`src/components/ComparisonChart.tsx`](./src/components/ComparisonChart.tsx): Gráfica interactiva con bandas de confianza `[P10, P90]` y línea de colapso hospitalario.
- [`src/components/MayorReportModal.tsx`](./src/components/MayorReportModal.tsx): Boletín ejecutivo en lenguaje claro para el Alcalde de Manta.
- [`backend/handler.ts`](./backend/handler.ts) & [`infra/template.yaml`](./infra/template.yaml): Función AWS Lambda (`arm64` en `us-east-1`), HTTP API Gateway y tabla DynamoDB On-Demand dentro del AWS Free Tier (`$0.00 USD`).

---

## 📚 Documentación Técnica y Pitch

1. [`docs/00-especificacion-reto.md`](./docs/00-especificacion-reto.md)
2. [`docs/01-vision-y-concepto.md`](./docs/01-vision-y-concepto.md)
3. [`docs/02-ciudad-3d-y-grafo-manta.md`](./docs/02-ciudad-3d-y-grafo-manta.md)
4. [`docs/03-modelo-matematico-y-estrategia.md`](./docs/03-modelo-matematico-y-estrategia.md)
5. [`docs/04-arquitectura-aws-y-costos.md`](./docs/04-arquitectura-aws-y-costos.md)
6. [`docs/05-prueba-de-fuego-y-plan-equipo.md`](./docs/05-prueba-de-fuego-y-plan-equipo.md)
7. [`docs/costos.md`](./docs/costos.md)
