# Protocolo de Prueba de Fuego, Brote Sorpresa y Plan para Equipo de 3

La **Prueba de Fuego vale el 40% de la nota total** y es el **primer criterio de desempate**. Este documento define cómo la interfaz y el equipo responden en menos de 5 minutos a cualquier cambio del jurado y cómo se divide el trabajo entre las 3 personas del equipo hasta el miércoles 28 de octubre a las 10:00 AM.

---

## 1. Anatomía de la Prueba de Fuego (40% de la Nota)

| Etapa del Jurado | Qué Evalúan | Cómo Responde Nuestro Sistema |
| :--- | :--- | :--- |
| **1. Presentación del escenario** | Plaga, población, supuestos y estrategia (Claridad 20% + Rigor 25%). | Mostramos el **Grafo 3D de Manta** con los 16 nodos reales, explicamos la doble vía **Necro-Dengue** y la regla estricta de vacunar solo a 🟢 `S`. |
| **2. Verificación con Semilla** | El jurado dicta una semilla (`seed`) en vivo y verifica que la estrategia supere a las líneas base (Impacto 30%). | Ingresamos la `seed` del jurado en el HUD, corremos $N=200$ simulaciones Monte Carlo y mostramos en vivo las 3 curvas con bandas P10–P90: **Nada vs. Azar vs. Estrategia**. |
| **3. 🎃 Brote Sorpresa (5 min)** | El jurado cambia condiciones en vivo (Brote Sorpresa 25%). | Usamos el panel **"🎃 Modo Brote Sorpresa"** sin tocar código y regeneramos el plan en `< 3 segundos`. |

---

## 2. Matriz de Respuesta para el "🎃 Brote Sorpresa" (En 5 Minutos)

Todos los cambios sorpresivos que menciona la especificación ya están contemplados como **controles directos en la UI**:

| Escenario Sorpresa del Jurado | Control Exacto en Nuestra Interfaz | Qué Hace Nuestro Algoritmo Automáticamente |
| :--- | :--- | :--- |
| *"Ahora el brote es el doble de contagioso"* | Slider **Transmisión ($\beta_h$)** $\times 2$ (o botón rápido `2x Contagio`). | Como el contagio rápido gana a la vacunación lenta, el algoritmo sube el peso de **🚧 Cierres de Aristas Puente** en los primeros 5 días para ganar tiempo. |
| *"Tienen la mitad de las vacunas / presupuesto"* | Slider **Presupuesto Diario ($B_t$)** al $50\%$. | Concentra el 100% de las pocas dosis en los 2 o 3 nodos de mayor centralidad (*Betweenness*) que rodean al foco activo en lugar de dispersarlas. |
| *"El brote empieza en el Mercado de Tarqui (o en la ULEAM)"* | Clic directo sobre el nodo 3D **Mercado de Tarqui** $\rightarrow$ *"Fijar como Paciente Cero"*. | Detecta que el nodo inicial es un hub de grado alto y aplica **Cordón Sanitario inmediato** en las aristas de salida de ese nodo en el Día 1. |
| *"Hay una variante que la vacuna cubre a medias"* | Slider **Efectividad de Vacuna ($\eta$)** de `85%` a `40%`. | El ratio de costo-beneficio ($\text{RCD}$) de la vacuna baja automáticamente, por lo que el algoritmo reasigna más presupuesto a **🌫️ Fumigación** y **🚧 Cordones Sanitarios**. |
| *"El brote empieza en 3 barrios al mismo tiempo"* | Selección múltiple de nodos iniciales en el mapa 3D (`Multi-Seed`). | Calcula el corte mínimo en el grafo que separa los nodos aún verdes de los 3 focos rojos y protege la capacidad del Hospital Rodríguez Zambrano. |

---

## 3. Blindaje contra Penalizaciones del Jurado

El documento oficial lista 6 errores que el jurado buscará penalizar. Así los neutralizamos todos:

1. **❌ Penalización: "Mostrar una sola simulación con buen resultado (puede ser suerte)."**
   - ✅ **Nuestra defensa:** La vista principal **siempre** corre un lote Monte Carlo ($M=100$ a $500$ corridas) y grafica la línea media más la banda sombreada de incertidumbre (Percentil 10 a Percentil 90) junto al histograma de vidas salvadas.
2. **❌ Penalización: "No tener línea base."**
   - ✅ **Nuestra defensa:** Nunca se grafica nuestra estrategia sola. Las gráficas muestran siempre las 3 series bloqueadas: 🔴 *Sin Intervención*, 🟡 *Intervención al Azar* (con igual presupuesto) y 🟢 *Estrategia SGC*.
3. **❌ Penalización: "Parámetros inventados sin explicar."**
   - ✅ **Nuestra defensa:** Cada slider en la UI tiene un tooltip `ℹ️` con la fuente del dato (INEC Manta, epidemiología de dengue en Manabí, capacidad hospitalaria) y está documentado en el `README.md`.
4. **❌ Penalización: "Vacunar a quien ya está infectado o es inmune."**
   - ✅ **Nuestra defensa:** En el motor matemático hay un `assert` explícito y un indicador en la UI que muestra: *"Dosis aplicadas únicamente a población 🟢 Susceptible ($S$): 100% — Desperdicio en $E/I/R$: 0%"*.
5. **❌ Penalización: "Un modelo tan complejo que el equipo no sabe explicar."**
   - ✅ **Nuestra defensa:** Usamos SEIR-V sobre un grafo de 16 nodos reales de Manta + heurística voraz por centralidad y riesgo ($\text{RCD}$). Cualquiera de los 3 integrantes puede explicarlo en un pizarrón en 60 segundos.
6. **❌ Penalización: "Estrategias que se rompen con el Brote Sorpresa."**
   - ✅ **Nuestra defensa:** El algoritmo no tiene reglas fijas atadas a un barrio; recalcula el score $\text{RCD}(a)$ dinámicamente en función de $\beta_h, \beta_v, \eta, B_t$ y el nodo de inicio.

---

## 4. División de Trabajo para el Equipo de 3 (48 Horas)

| Integrante | Rol Principal | Responsabilidades y Entregables |
| :--- | :--- | :--- |
| **Integrante 1** | **Motor Matemático & Algoritmos de Grafo** | - Grafo JSON de los 16 nodos de Manta y aristas de transporte.<br>- Motor SEIR-V estocástico con PRNG reproducible por `seed`.<br>- Implementación de las 3 estrategias (Nada, Azar, Smart Graph Cortafuegos) y agregador Monte Carlo.<br>- Pruebas unitarias de reproducibilidad y no-vacunación de infectados. |
| **Integrante 2** | **Frontend 3D (Manta) & Dashboard de Comando** | - Escena 3D con `MapLibre GL` (edificios 3D de Manta) + `Deck.gl` (`ColumnLayer` para nodos SEIR y `ArcLayer` para rutas).<br>- Panel **"🎃 Modo Brote Sorpresa"** con sliders en vivo y reproductor Día 0 a Día $T$.<br>- Gráficas comparativas de las 3 curvas con rangos P10–P90. |
| **Integrante 3** | **Arquitectura AWS, IA (Alcalde) & Entregables de Rúbrica** | - Configuración inmediata de **AWS Budget** (`docs/budget.png`) en `us-east-1`.<br>- Despliegue Serverless (Lambda + API Gateway + DynamoDB + Hosting Frontend).<br>- Integración con Bedrock para el *"Informe al Alcalde"*.<br>- Diagrama `docs/arquitectura.drawio` + `docs/costos.md` + `README.md` y deck del Pitch. |

---

## 5. Cronograma de Ejecución (Hasta Miércoles 28 Oct — 10:00 AM)

- **Fase 1 (Hoy Lunes Tarde):**
  - Captura de AWS Budget lista (`docs/budget.png`).
  - JSON de los 16 nodos de Manta con coordenadas reales y motor SEIR-V corriendo en local con semilla reproducible.
  - Mapa 3D de Manta levantado en el navegador mostrando los 16 nodos y arcos en 3D.
- **Fase 2 (Martes Mañana y Tarde):**
  - Conexión completa del motor Monte Carlo con las 3 curvas (Nada, Azar, Estrategia) y el reproductor día a día en el mapa 3D.
  - Despliegue de la Lambda y API Gateway en `us-east-1` + endpoint de Informe del Alcalde.
  - Pruebas de estrés del **Modo Brote Sorpresa** (simulacros de 5 minutos cambiando parámetros).
- **Fase 3 (Martes Noche / Miércoles 06:00–09:00 AM):**
  - Despliegue final en URL pública de AWS.
  - Redacción impecable de `README.md`, `docs/costos.md`, exportación de `docs/arquitectura.png` + `.drawio` y PDF del Pitch.
  - Entrega oficial antes de las **09:30 AM** (30 minutos de margen antes del cierre a las 10:00 AM).
