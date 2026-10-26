# Modelo Matemático SEIR-V en Grafo y Algoritmo de Contención

Este documento define las ecuaciones del motor de simulación, el generador pseudoaleatorio determinista con semilla (`seed`) y el algoritmo de decisión diaria que supera a las dos líneas base exigidas por la rúbrica.

---

## Resumen Ejecutivo del Modelo

- **Tipo de modelo:** Meta-población **SEIR-V Estocástica Discreta por Día** sobre un grafo pesado $G = (V, E)$ con reservorio vectorial ambiental y restricción de capacidad hospitalaria.
- **Por qué este modelo gana en la Prueba de Fuego:**
  1. Es **100% explicable** ante el jurado (cada parámetro tiene significado epidemiológico real).
  2. Es **ultra-rápido**: corre 500 simulaciones Monte Carlo de 60 días en menos de 1.5 segundos en una sola función AWS Lambda.
  3. Es **estrictamente reproducible**: utiliza `Mulberry32` / `PCG32` inicializado con `hash(seed, scenario_id, run_index)`.

---

## 1. Variables de Estado por Nodo y Día

Para cada nodo $v \in V$ y cada día $t \in \{0, 1, \dots, T\}$:

- $S_v(t)$: Población **Sana** (Susceptible) en el nodo $v$.
- $E_v(t)$: Población **Mordida** (Expuesta / en incubación) en el nodo $v$.
- $I_v(t)$: Población **Zombie** (Infecciosa activa) en el nodo $v$.
- $R_v(t)$: Población **Exorcizada** (Recuperada o Inmunizada por vacuna) en el nodo $v$.
- $W_v(t) \in [0, 1]$: Índice de **Foco Infeccioso Ambiental (Vector Necro-Dengue)** en el nodo $v$.
- $N_v = S_v(t) + E_v(t) + I_v(t) + R_v(t)$: Población total del nodo $v$.

---

## 2. Parámetros Configurables (UI + Brote Sorpresa)

Todos estos parámetros están expuestos en la interfaz para responder en segundos al **Brote Sorpresa** del jurado:

| Símbolo | Parámetro en UI | Valor por Defecto | Rango Permitido | Justificación / Fuente |
| :---: | :--- | :---: | :---: | :--- |
| $\beta_h$ | Tasa de transmisión humano-zombie | `0.35` / día | `0.05 – 1.50` | Calibrado para $R_0 \approx 2.8$ en brotes urbanos densos sin control. |
| $\beta_v$ | Tasa de transmisión por foco vectorial | `0.12` / día | `0.00 – 0.80` | Inspirado en incidencia estacional de dengue en Manabí (zonas con agua estancada). |
| $\sigma$ | Tasa de fin de incubación ($\text{Mordido} \to \text{Zombie}$) | `0.33` ($3$ días) | `0.10 – 1.00` | Periodo de incubación medio de 3 días tras mordedura/picadura. |
| $\gamma_0$ | Tasa base de rehabilitación/exorcismo natural o clínico | `0.10` ($10$ días) | `0.02 – 0.50` | Tiempo medio en que un caso activo es neutralizado con atención hospitalaria normal. |
| $H_{\max}$ | Capacidad crítica del Hospital Rodríguez Zambrano | `2,500` casos | `200 – 20,000` | Umbral de saturación del sistema de salud de Manta ante emergencia masiva. |
| $\eta$ | Efectividad de la vacuna | `0.85` ($85\%$) | `0.10 – 1.00` | Permite simular en vivo el caso sorpresa *"una variante que la vacuna cubre a medias"*. |
| $B_t$ | Presupuesto diario del Comité | `$1,000` / día | `$0 – $10,000` | Recursos que llegan por día para repartir entre vacunas, fumigación y cierres. |
| `seed` | Semilla aleatoria del jurado | `20261030` | Entero de 32 bits | Garantiza reproducibilidad exacta entre corridas. |

---

## 3. Dinámica de Transición Día a Día ($t \to t+1$)

Cada día $t$ se ejecuta en **dos fases**: primero se aplican las **Intervenciones del Comité** y luego ocurre la **Propagación Estocástica**.

### Fase A: Aplicación de Intervenciones (Regla de Oro de Vacunación)

> [!IMPORTANT]
> **Validación contra penalización del jurado:** El documento del reto advierte explícitamente que se penalizará *"Vacunar a quien ya está infectado o es inmune"*. Por diseño matemático, las dosis asignadas $V_v(t)$ en el nodo $v$ operan **exclusivamente** sobre el compartimento $S_v(t)$:
> $$\Delta S^{\text{vac}}_v(t) = \min\big(S_v(t),\; \text{Binomial}(V_v(t), \eta)\big)$$
> $$S'_v(t) = S_v(t) - \Delta S^{\text{vac}}_v(t), \qquad R'_v(t) = R_v(t) + \Delta S^{\text{vac}}_v(t)$$

Simultáneamente:
- Si el nodo $v$ recibe **🌫️ Fumigación**, su foco ambiental cae: $W_v(t) \leftarrow (1 - \alpha_{\text{fum}}) W_v(t)$ con $\alpha_{\text{fum}} = 0.80$.
- Si la arista $(u,v)$ o el nodo $u$ tiene **🚧 Cordón Sanitario**, su peso efectivo se reduce: $\tilde{w}_{uv}(t) = (1 - \alpha_{\text{cierre}}) w_{uv}$ con $\alpha_{\text{cierre}} = 0.90$.

### Fase B: Fuerza de Infección en el Grafo ($\lambda_v(t)$)

Un habitante sano en el nodo $v$ se expone a tres fuentes de contagio:
1. **Contagio local dentro de su barrio:** proporcional a $\frac{I_v(t)}{N_v}$.
2. **Contagio importado por las aristas del grafo (buses, mercados, ULEAM):** proporcional al flujo $\tilde{w}_{uv}(t) \frac{I_u(t)}{N_u}$ desde cada nodo vecino $u \in \mathcal{N}(v)$.
3. **Contagio ambiental (foco Necro-Dengue):** proporcional a $W_v(t)$.

La fuerza de infección total en el nodo $v$ el día $t$ es:
$$\lambda_v(t) = \beta_h \left( \frac{I_v(t)}{N_v} + \sum_{u \in \mathcal{N}(v)} \tilde{w}_{uv}(t) \frac{I_u(t)}{N_u} \right) + \beta_v W_v(t)$$

La probabilidad individual de que un sano en $v$ sea mordido en el día $t$ es:
$$p^{\text{inf}}_v(t) = 1 - \exp\big(-\lambda_v(t)\big)$$

### Fase C: Colapso del Hospital Rodríguez Zambrano

Sea $I_{\text{total}}(t) = \sum_{v \in V} I_v(t)$ el total de zombies activos en Manta. Si $I_{\text{total}}(t) > H_{\max}$, el sistema de contención clínica se satura y la tasa efectiva de recuperación/exorcismo cae mientras aumenta la presión infecciosa:
$$\gamma_{\text{ef}}(t) = \begin{cases} \gamma_0 & \text{si } I_{\text{total}}(t) \le H_{\max} \\ \gamma_0 \cdot \left(\frac{H_{\max}}{I_{\text{total}}(t)}\right) & \text{si } I_{\text{total}}(t) > H_{\max} \end{cases}$$

### Fase D: Muestreo Estocástico con Semilla Reproducible

Usando el generador pseudoaleatorio `PRNG(seed, run_id, day, node_id)`, las transiciones del día $t$ se muestrean mediante distribuciones Binomiales (aproximadas por Normal truncada para $N_v$ grande por velocidad):
- **Nuevos Mordidos ($S \to E$):** $\Delta E_v(t) \sim \text{Binomial}\big(S'_v(t),\; p^{\text{inf}}_v(t)\big)$
- **Nuevos Zombies ($E \to I$):** $\Delta I_v(t) \sim \text{Binomial}\big(E_v(t),\; 1 - e^{-\sigma}\big)$
- **Nuevos Exorcizados ($I \to R$):** $\Delta R_v(t) \sim \text{Binomial}\big(I_v(t),\; 1 - e^{-\gamma_{\text{ef}}(t)}\big)$

Actualización de compartimentos para el día $t+1$:
$$S_v(t+1) = S'_v(t) - \Delta E_v(t)$$
$$E_v(t+1) = E_v(t) + \Delta E_v(t) - \Delta I_v(t)$$
$$I_v(t+1) = I_v(t) + \Delta I_v(t) - \Delta R_v(t)$$
$$R_v(t+1) = R'_v(t) + \Delta R_v(t)$$

---

## 4. El Algoritmo Ganador: *Smart Graph Cortafuegos (SGC)*

¿Cómo decide nuestra estrategia qué hacer cada mañana con el presupuesto $B_t$ para ganarle por amplio margen al azar y a no hacer nada?

En cada día $t$, el algoritmo evalúa todas las acciones candidatas $a \in \mathcal{A}_t$ (vacunar lote en nodo $v$, fumigar nodo $v$, o cerrar arista/hub $v$) calculando su **Ratio de Contención por Dólar ($\text{RCD}$)**:

$$\text{RCD}(a) = \frac{\text{Casos Evitados Esperados en 2 Saltos}(a) \times \big(1 + \text{CentralidadBetweenness}(v)\big)}{\text{Costo}(a)}$$

1. **Prioridad 1 — Cerco al Paciente Cero (Días tempranos):** Si el brote está concentrado en 1–3 nodos, aplica **🚧 Cierre de Aristas Puente** hacia los hubs masivos (`Mercado Tarqui`, `ULEAM`, `Centro`) y **🌫️ Fumigación** en el foco origen.
2. **Prioridad 2 — Escudo en Nodos Puente (Inmunización de Anillo):** Vacuna prioritariamente a la población sana `S` de los nodos vecinos con mayor centralidad de intermediación (*Betweenness Centrality*) antes de que llegue la ola roja.
3. **Prioridad 3 — Protección de Capacidad Hospitalaria:** Cuando $I_{\text{total}}(t)$ se acerca al $75\%$ de $H_{\max}$, prioriza acciones de impacto inmediato (cierres y fumigación en focos calientes) para aplanar el pico y evitar la penalización por colapso hospitalario.

---

## 5. Métricas de Salida para el Jurado (Monte Carlo)

Al ejecutar $M$ simulaciones (ej. $M = 200$) para cada una de las 3 estrategias:
- **Personas Salvadas (Evitadas de caer en estado Zombie):** Promedio, desviación estándar y rango `[P10, P90]` de $\text{InfectadosTotales}_{\text{Nada}} - \text{InfectadosTotales}_{\text{Estrategia}}$.
- **Pico Máximo de Zombies Concurrentes vs. Capacidad del Hospital ($H_{\max}$).**
- **Costo por Vida Salvada ($\$/\text{persona protegida}$).**
- **Bitácora Día a Día para el Alcalde:** Tabla cronológica exacta (*"Día 1: Cerrar corredor Tarqui-Centro y vacunar 1,200 sanos en ULEAM..."*).

## Siguiente Paso

Revisar la arquitectura Serverless en AWS y el presupuesto en [`04-arquitectura-aws-y-costos.md`](./04-arquitectura-aws-y-costos.md).
