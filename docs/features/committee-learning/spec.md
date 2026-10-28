---
status: Draft
owner: "Tech Lead"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-27"
feature_size: L
---

# Spec — committee-learning

> **Glossary:** [CONTEXT](./CONTEXT.md). Entradas: [idea brief](../../idea-brief.md), [evidencia](./evidence/experiment.md), código de la revisión indicada en CONTEXT. Profundidad easy; decisiones técnicas delegadas, sin nuevas respuestas de producto inventadas. Crítica final del paquete: pendiente del agente principal.

## 1. Context

CommitteeOperator necesita una estrategia que se afine usando resultados de simulaciones, no solo repetir la heurística existente. El juego manual y la campaña de cura conservan sus reglas y objetivo.

El usuario pidió un plan completo para que otro agente implemente sin decidir producto o arquitectura. La investigación local encontró mejora en un escenario alterado y empate en el estándar: respalda una familia acotada, no una promesa de victoria universal.

El enfoque comprometido agrega Comité como modo separado: ejecución automática simulada, visualización diaria y recomendaciones progresivas que solo cambian cuando hay evidencia independiente de mejora. Se reutilizan estrategias compatibles, se exploran nuevas candidatas y se conserva una alternativa validada ante empate o fallo.

Las políticas se juzgan por media de contagios acumulados al cierre de 40 días por defecto, con las mismas condiciones y recursos. La prevención posterior y la utilidad clínica están fuera de lo demostrado. La selección, reproducción y límites concretos se fijan en diseño como supuestos reversibles del arquitecto.

## 2. Goals

- Entregar recomendaciones reproducibles que distingan estrategia base, mejora progresiva y auditoría final.
- Comparar de forma justa una política aprendida con la heurística existente y ambas líneas base, comunicando incertidumbre y resultados sin mejora.
- Acotar abuso, consumo y fallos sin afectar las partidas manuales ni divulgar resultados de otras sesiones.

## 3. Non-goals

- No sustituir juego, campaña o condición de victoria por cura; Comité es otro modo.
- No automatizar actuaciones reales, afirmar calibración epidemiológica ni optimalidad global.
- No entrenar redes neuronales ni exigir modelos de lenguaje o aceleradores; se aprende una familia explicable de prioridades.
- No ejecutar aprendizaje perpetuo, reanudar búsquedas caídas ni garantizar un techo duro de factura mediante una alerta.

## 4. User stories

### US-01: Abrir un modo independiente
**As a** CommitteeOperator
**I want** entrar en Comité sin perder el acceso al juego y la campaña
**So that** pueda distinguir análisis automático y decisiones manuales.

### US-02: Solicitar una búsqueda privada
**As a** CommitteeOperator
**I want** iniciar y consultar una búsqueda para un escenario
**So that** obtenga una recomendación sin esperar una operación interactiva bloqueada.

### US-03: Ver mejoras justificadas
**As a** CommitteeOperator
**I want** recibir una base validada y solo después mejoras demostradas
**So that** no confunda una candidata afortunada con evidencia generalizable.

### US-04: Reproducir acciones y resultados
**As a** CommitteeOperator
**I want** reproducir los días y auditar la comparación
**So that** pueda explicar dónde, cuándo y por qué actúa cada política.

### US-05: Cancelar y recuperar fallos
**As a** CommitteeOperator
**I want** cancelar o conocer el motivo de un trabajo detenido
**So that** conserve lo validado sin lanzar cómputo duplicado.

### US-06: Habilitar consumo comprobado
**As a** ReleaseOperator
**I want** medir costo y límites antes de habilitar aprendizaje
**So that** el piloto respete su objetivo de consumo con margen explícito.

## 5. Acceptance criteria

### AC-01 (US-01) — cross-context
**Given** una sesión válida con acceso al juego manual y a la campaña
**When** CommitteeOperator cambia entre esos modos y Comité
**Then** cada experiencia conserva sus reglas y el juego no recibe acciones ni resultados del Comité.

### AC-02 (US-02) — happy
**Given** una sesión válida y capacidad disponible
**When** CommitteeOperator solicita un escenario válido
**Then** recibe un identificador privado, ve el avance y obtiene una base identificada como no aprendida antes de cualquier mejora.

### AC-03 (US-02) — error
**Given** valores fuera de los límites admitidos o parámetros internos de búsqueda enviados por quien solicita
**When** CommitteeOperator intenta iniciar el trabajo
**Then** se rechaza con una explicación sin consumir una admisión ni iniciar simulaciones.

### AC-04 (US-02) — authorization
**Given** sesión ausente, caducada o diferente de la propietaria, incluso con el mismo código de invitación
**When** alguien intenta consultar, cancelar o descargar un trabajo privado
**Then** se deniega el acceso sin revelar resultados ni permitir inferir la existencia de trabajos ajenos.

### AC-05 (US-02) — domain invariant
**Given** una misma solicitud repetida o dos solicitudes que compiten por la capacidad disponible
**When** CommitteeOperator intenta admitirlas
**Then** repetir no crea otro trabajo ni cobra otra reserva, y solo una búsqueda puede ejecutar cómputo de aprendizaje a la vez.

### AC-06 (US-03) — domain invariant
**Given** políticas comparadas en un mismo escenario, presupuesto, horizonte y conjunto de réplicas
**When** se evalúa una candidata
**Then** se minimiza la media de contagios acumulados al cierre y se informa dispersión por separado, sin acceso de la política a estados futuros o semillas.

### AC-07 (US-03) — happy
**Given** una candidata congelada con una mejora estricta respaldada por datos nuevos de promoción
**When** termina esa evaluación independiente
**Then** se publica una versión progresiva inmutable; un empate o evidencia insuficiente conserva la anterior y nunca se anuncia una mejora garantizada en todos los brotes.

### AC-08 (US-03) — error
**Given** una mejora progresiva cuya auditoría final no respalda superar la base
**When** finaliza el trabajo
**Then** la recomendación final vuelve a la base, se muestra que no hubo mejora final respaldada y se preserva el historial progresivo sin presentarlo como aprobación final.

### AC-09 (US-04) — happy
**Given** una versión validada accesible para la sesión propietaria
**When** CommitteeOperator reproduce o vuelve a evaluar su manifiesto
**Then** ve acciones y resultados diarios y reproduce los resultados numéricos con las mismas versiones, configuración, semillas y biblioteca congelada.

### AC-10 (US-04) — domain invariant
**Given** una trayectoria de cualquier política admitida
**When** se aplican acciones cada día
**Then** se conserva la población, solo se vacuna a susceptibles y el costo real de las órdenes no supera el presupuesto común.

### AC-11 (US-05) — error
**Given** un trabajo cancelado, vencido, duplicado o con un fallo de infraestructura
**When** llega una entrega tardía o se reconcilia su estado
**Then** no se reinicia la búsqueda, su finalización ocurre una sola vez y se conserva únicamente la última versión validada que exista, con su alcance claramente indicado.

### AC-12 (US-05) — happy
**Given** un trabajo activo propiedad de la sesión
**When** CommitteeOperator solicita cancelarlo
**Then** se detiene de forma acotada, puede consultar el resultado validado disponible y no se presenta una auditoría final que no se ejecutó.

### AC-13 (US-06) — domain invariant
**Given** el objetivo mensual de consumo y los límites de admisión configurados
**When** una solicitud agotaría una cuota o ya existe un trabajo activo
**Then** se rechaza sin sobrepasar reservas; las reservas admitidas no se devuelven en este piloto aunque el trabajo use menos cómputo.

### AC-14 (US-06) — cross-context
**Given** que falta evidencia del perfil real o una autorización de publicación
**When** se intenta habilitar aprendizaje en el entorno compartido
**Then** permanece deshabilitado, se explica el requisito pendiente y no se utiliza el saldo declarado como cobertura garantizada.

### AC-15 (US-03) — cross-context
**Given** estrategias guardadas de escenarios anteriores
**When** se inicia una nueva búsqueda
**Then** solo se reutilizan pesos compatibles como candidatas evaluadas de nuevo, sin divulgar propietarios, semillas ni historiales privados de otros trabajos.

### AC-16 (US-05) — domain invariant
**Given** una revisión de estado más nueva recibida antes de una anterior
**When** la interfaz actualiza el avance
**Then** no retrocede la revisión; una auditoría final puede cambiar honestamente la política recomendada a la base sin borrar la evidencia anterior.

## 6. Non-functional requirements

Targets definidos como supuestos del arquitecto, no como mediciones ya obtenidas.

| ID | Aspect | Target | Measurement |
| --- | --- | --- | --- |
| NFR-01 | Respuesta interactiva | p95 ≤ 1500 ms a 2 solicitudes/s durante 60 s | Medición de rutas de admisión/estado sin ejecutar búsqueda en la petición |
| NFR-02 | Primera base validada | objetivo ≤ 30 s desde inicio del worker | Perfil real obligatorio antes de habilitar entrenamiento |
| NFR-03 | Límites por trabajo | ≤ 480 s de presupuesto blando, 600 s duro, 4096 trayectorias | Reloj, contador y terminación de plataforma |
| NFR-04 | Consumo reservado | ≤ 100 trabajos y 120000 GB-s por mes UTC; 1200 GB-s por trabajo | Transacción de admisión, sin devolución en v1 |
| NFR-05 | Concurrencia y cuota | 1 trabajo activo global; 5 admisiones por sesión/día UTC | Condiciones atómicas, pruebas de carreras |
| NFR-06 | Privacidad | 0 accesos entre sesiones; retención lógica de trabajos 7 días | Pruebas adversariales y expiración en lectura |
| NFR-07 | Consulta y cancelación | polling 2 s visible y 10 s oculto; consulta de cancelación antes de cada trayectoria | Reloj controlado y prueba UI |
| NFR-08 | Publicación | ≤ 8 intentos de promoción; revisión de estado siempre creciente | Prueba de protocolo y comparación condicional |

## 6.1 Security / privacy

- **Data classification:** confidential: escenarios/resultados privados por sesión, sin datos clínicos personales nuevos.
- **Personal data touched:** ninguno nuevo; la identidad de propiedad se deriva en servidor de la sesión validada y no se publica.
- **AuthZ/AuthN impact:** todas las operaciones nuevas requieren sesión vigente y propiedad; un nuevo login no recupera trabajos de la sesión anterior.
- **Abuse cases:** enumeración de trabajos ajenos → ocultar existencia; carga maliciosa → límites estrictos; reintentos → admisión única; códigos compartidos → separar sesiones; biblioteca → compartir solo pesos compatibles; agotamiento de crédito → cuotas conservadoras, no confiar en alertas.
- **Security review:** Required por nueva frontera de propiedad, persistencia y ejecución asíncrona.

## 7. Metrics / KPIs

- **Ganancia demostrada:** base actual 0 mejoras aprendidas en producto; objetivo al cerrar el piloto: informar ganancia o empate en todas las comparaciones, sin umbral universal de victoria. Evidencia local: estándar empate; escenario alterado mejora de 3,018177%.
- **Reproducibilidad:** base de investigación con comprobaciones exactas; objetivo para primera entrega: 100% de fixtures de paridad y manifiestos reproducidos sin alterar el juego.
- **Publicación honesta:** base de producto sin auditoría aprendida; objetivo primera entrega: 0 versiones etiquetadas final-aprobadas sin auditoría final favorable.
- **Consumo:** base del nuevo worker aún no medida; objetivo del piloto: 5 USD/mes de diseño, con reservas conservadoras y revisión de factura; medir antes de habilitar y al cerrar cada mes.

## 8. Open questions

No quedan decisiones de producto ni arquitectura para el agente de coding. Los siguientes son gates externos con acción y responsable, no permisos implícitos:

- [ ] Perfil real de duración y costo aprobado. Default now: aprendizaje deshabilitado. — owner: ReleaseOperator, due: antes de habilitar entrenamiento compartido.
- [ ] Crédito declarado de 140 USD: vencimiento y productos elegibles verificados. Default now: no descontar créditos de estimaciones. — owner: ReleaseOperator, due: antes de basar un gasto en esos créditos.
- [ ] Autorización de despliegue/publicación y revisión independiente del paquete. Default now: solo implementación local. — owner: Tech Lead y ReleaseOperator, due: antes de cualquier cambio cloud o entrega pública.
