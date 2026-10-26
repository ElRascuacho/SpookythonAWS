# Operación Manta Cero: El Comité contra el Necro-Dengue

**Operación Manta Cero** es un sistema de soporte a la decisión epidemiológica que simula la propagación de una plaga zombie híbrida (**Necro-Dengue**) sobre un grafo 3D de la ciudad de Manta y optimiza la asignación diaria de recursos limitados (vacunas, fumigación y cordones sanitarios) para minimizar infecciones y evitar el colapso del Hospital Rodríguez Zambrano.

---

## Ruta Rápida de Lectura

1. **¿Qué problema resuelve?** Asigna un presupuesto diario limitado entre múltiples intervenciones para salvar la mayor cantidad de habitantes frente a no hacer nada o actuar al azar.
2. **¿Cómo lo visualiza?** Presenta a Manta como una **ciudad en 3D interactiva** donde los barrios, mercados, universidades y colegios son **nodos de un grafo** conectados por aristas de transporte público y movilidad urbana.
3. **¿Cómo gana la Prueba de Fuego?** Recalcula en menos de 3 segundos cientos de simulaciones Monte Carlo con semilla reproducible (`seed`) ante cualquier cambio del jurado en el **Modo Brote Sorpresa**.

---

## Fusión de las 3 Ideas Nucleares

| Pilar | Nombre Interno | Mecanismo en el Sistema | Requisito Nivel Pro Cubierto |
| :--- | :--- | :--- | :--- |
| **1. Grafo Urbano 3D** | *El Cortafuegos de Tarqui* | Manta modelada como grafo $G=(V,E)$ sobre un mapa 3D. Identifica nodos puente (alta centralidad de intermediación) y corta rutas críticas antes de que el brote salte de parroquia. | Mapa animado del avance de la plaga + Modelo SEIR sobre grafo. |
| **2. Doble Vía de Contagio** | *Operación Necro-Dengue* | Combina contagio persona a persona ($\beta_h$) con reservorios/vectores ambientales por zona ($\beta_v$, inspirado en el dengue en Manabí). Habilita brigadas de fumigación además de vacunas. | Calibración con datos reales (dengue Manabí + INEC) + Intervenciones combinadas. |
| **3. Triaje Dinámico y Hospital** | *Triaje Día a Día del Alcalde* | El presupuesto y los lotes de vacunas llegan por día. Si los zombies activos superan las camas críticas del Hospital Rodríguez Zambrano, la tasa de letalidad/conversión se duplica. | Recursos por días, decisiones adaptativas e informe simple para el Alcalde. |

---

## Estados Epidemiológicos Oficiales

Cada habitante dentro de un nodo $v \in V$ pertenece exactamente a uno de los 4 estados del modelo **SEIR-V (Susceptible - Exposed - Infectious - Recovered/Exorcised)**:

| Estado | Código | Nombre en UI | Comportamiento Matemático | Regla de Oro (Rúbrica) |
| :--- | :---: | :--- | :--- | :--- |
| 🟢 **Sano** | `S` | Susceptible | Puede ser mordido por contacto directo o por vector ambiental. | **Único estado elegible para recibir vacuna.** |
| 🟡 **Mordido** | `E` | Expuesto (Incubando) | Infectado en periodo de incubación ($\sigma^{-1}$ días). Aún no muerde, pero no puede ser vacunado con vacuna preventiva. | No recibe vacuna preventiva (evita penalización del jurado). |
| 🔴 **Zombie** | `I` | Infeccioso | Contagia activamente en su nodo y a través de las aristas de transporte hacia nodos vecinos. | Genera presión sobre la capacidad hospitalaria. |
| 🔵 **Exorcizado** | `R` | Recuperado / Inmune | Inmunizado por vacuna exitosa o rehabilitado tras intervención. No vuelve a contagiarse ni contagia. | Excluido del pool de vacunación para no desperdiciar dosis. |

---

## Catálogo de Intervenciones y Costos

El Comité de Contención recibe un **presupuesto diario $B_t$** (y/o stock de dosis) y debe repartirlo entre tres acciones complementarias:

| Intervención | Símbolo | Efecto en el Modelo | Costo Unitario (Configurable) | Cuándo la elige el Algoritmo |
| :--- | :---: | :--- | :--- | :--- |
| **Vacunación Estratégica** | 💉 | Transfiere individuos $S \to R$ con efectividad $\eta \in (0, 1]$ en el nodo seleccionado. | Bajo ($c_{vac}$ por lote de 100 dosis) | En nodos con alta centralidad y alta población sana amenazada por nodos vecinos infectados. |
| **Brigada de Fumigación** | 🌫️ | Reduce el nivel de foco vectorial ambiental $W_v(t)$ del barrio en un $80\%$ durante $D_{fum}$ días. | Medio ($c_{fum}$ por brigada/barrio) | En barrios con alta densidad de contagio ambiental (ej. Tarqui, Playita Mía tras lluvias). |
| **Cordón Sanitario / Cierre** | 🚧 | Reduce el peso de flujo $w_{uv}$ de una arista o nodo masivo (ej. ULEAM, Mercado Central, Terminal) en un $90\%$ por $D_{cierre}$ días. | Alto ($c_{cierre}$ por impacto económico/social) | Cuando un nodo super-propagador supera el umbral crítico de zombies y amenaza con exportar el brote a toda la ciudad. |

---

## Comparativa Obligatoria:Las 3 Líneas de Simulación

Toda ejecución del motor corre simultáneamente tres escenarios bajo la **misma semilla (`seed`)** y con **exactamente el mismo presupuesto**:

1. 🔴 **Línea Base 1 — Sin Intervención (`No-Op`):** Evolución natural del brote con presupuesto $0$. Muestra el techo de catástrofe y el día exacto en que colapsa el Hospital Rodríguez Zambrano.
2. 🟡 **Línea Base 2 — Intervención al Azar (`Random Baseline`):** Gasta el mismo presupuesto diario asignando vacunas, fumigación y cierres en nodos/aristas elegidos de forma uniforme al azar (respetando vacunar solo a `S`).
3. 🟢 **Estrategia Propuesta — Cortafuegos Adaptativo (`Smart Graph Containment`):** Asigna cada dólar diario maximizando el *Score de Impacto Marginal sobre el Grafo*.

---

## Checklist de Cumplimiento de Requisitos

- [x] Simulación día a día ($t = 0, 1, \dots, T$).
- [x] Intervenciones con recursos limitados y costos configurables.
- [x] Comparación directa contra **Sin Intervención** e **Intervención al Azar**.
- [x] Ejecución Monte Carlo ($N$ corridas por escenario) reportando media, mediana y rango intercuartil / percentil 10–90.
- [x] Interfaz 3D + panel de control para alterar todos los parámetros en vivo.
- [x] Reproducibilidad determinista mediante generador pseudoaleatorio con semilla (`PRNG seed`).
- [x] Arquitectura 100% Serverless en AWS (`us-east-1`) dentro del Free Tier.

## Siguiente Paso

Revisar el diseño visual y estructural del mapa en [`02-ciudad-3d-y-grafo-manta.md`](./02-ciudad-3d-y-grafo-manta.md) y la formulación matemática exacta en [`03-modelo-matematico-y-estrategia.md`](./03-modelo-matematico-y-estrategia.md).
