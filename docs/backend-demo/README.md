# Plan Maestro de Implementación Backend — Operación Manta Cero

> **Estado del Documento:** Plan de Implementación de Referencia y Arquitectura Objetivo (Hackathon Spookython AWS — Track B).  
> **Ventana de Ejecución:** 4 días previos a la demostración ante el jurado.  
> **Ámbito de Intervención:** Exclusivo de backend, infraestructura serverless y contratos de datos. Componentes de interfaz de usuario (`src/App.tsx`, vistas 3D) pertenecen al compañero de equipo y no se modifican.  
> **Regla de Ejecución:** Cero despliegues destructivos, cero commits automáticos no supervisados y cero suposiciones de servicios no verificados en la cuenta.

---

## 1. Resumen Ejecutivo (Outcome)

El objetivo de este plan es transformar el prototipo síncrono actual en una **arquitectura de simulación epidemiológica asíncrona, determinista y de costo acotado en AWS Serverless (`us-east-1`)**, capaz de procesar **500 corridas Monte Carlo por estrategia** (1.500 corridas base obligatorias: `NO_INTERVENTION`, `RANDOM`, `SMART_CORTAFUEGOS`; y 2.000 corridas totales cuando se habilita la estrategia opcional asistida por IA `AI_CORTAFUEGOS`), garantizando tiempos de respuesta de API sub-segundo, aislamiento estricto de acceso mediante invitaciones y cero riesgo de desbordamiento presupuestario.

```mermaid
flowchart TD
    subgraph ClientLayer ["Cliente Web / Jurado"]
        Browser["Navegador Web (Pitch 5 min)\nReact 19 + Vite + MapLibre 3D"]
    end

    subgraph EdgeAPI ["Capa Perimetral y Autenticación (us-east-1)"]
        CF["CloudFront CDN\n(Hosting Estático UI)\nOAC a S3 Web Bucket"]
        APIGW["Amazon API Gateway HTTP API\n(CORS Estricto, Cookies HttpOnly SameSite)"]
        AuthHandler["Lambda: API & Access Guard\n(Node 22 ARM64 / Valida Hash Tokens)"]
        DDB["Amazon DynamoDB (On-Demand)\n(Invitaciones, Sesiones, Jobs, Cuotas, GSI1/GSI2/GSI3, TTL 7d)"]
    end

    subgraph Orchestration ["Orquestación y Cómputo Asíncrono"]
        StepFn["AWS Step Functions (Standard Workflow)\n(Inline Map: 25 corridas/lote, Concurrencia <= 4)"]
        PolicyGen["Lambda Opcional: Generador Política IA\n(Amazon Bedrock: Nova Micro / Timeout 15s)"]
        WorkerBatch["Lambda: Worker Monte Carlo SEIR-V\n(Node 22 ARM64 / esbuild / 25 runs por lote)"]
        Aggregator["Lambda: Agregador y Finalizador\n(Calcula P10/Media/P90, Run 0, Valida Manifiesto)"]
        S3Private["Amazon S3 (Bucket Privado de Resultados)\n(JSON Particionados / Cero Acceso Público)"]
        Reconciler["Lambda: Reconciliador Programado\n(EventBridge Cron: Recupera Jobs Huérfanos vía GSI3)"]
    end

    Browser -->|1. Carga UI Estática| CF
    Browser -->|2. POST /api/v1/auth/session| APIGW
    APIGW --> AuthHandler
    AuthHandler -->|Valida Hash Invitación / Emite Token| DDB
    Browser -->|3. POST /api/v1/jobs (202 Accepted)| APIGW
    AuthHandler -->|Transacción Atómica: Cuota Global + Invitación + Slot + PENDING| DDB
    AuthHandler -->|Inicia Ejecución Determinista| StepFn
    StepFn -->|Paso Opcional: Genera Política Declarativa| PolicyGen
    StepFn -->|Inline Map Lotes en Paralelo| WorkerBatch
    WorkerBatch -->|Escribe Lote Parcial| S3Private
    StepFn -->|Paso Final: Consolidación| Aggregator
    Aggregator -->|Lee Lotes, Calcula P10/P90, Extrae Run 0| S3Private
    Aggregator -->|Transacción Atómica: COMPLETED + Libera Slot| DDB
    Browser -->|4. Poll GET /api/v1/jobs/:id| APIGW
    AuthHandler -->|Lee Estado y Cuota| DDB
    Browser -->|5. GET /api/v1/jobs/:id/results| APIGW
    AuthHandler -->|Proxy Autenticado de Resultados S3| S3Private
    Reconciler -.->|Consulta GSI3 Jobs PENDING/RUNNING Vencidos| DDB
    Reconciler -.->|DescribeExecution / Cierra Fallidos Exactly-Once| StepFn
```

---

## 2. Estado Actual vs. Arquitectura Objetivo

| Dimensión | Estado Actual en Repositorio (`main`) | Arquitectura Objetivo (Plan Demo 4 Días) |
| :--- | :--- | :--- |
| **Punto de Entrada API** | `POST /simulate` y `POST /mayor-report` en [`backend/handler.ts`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/backend/handler.ts). Síncrono, público (`Allow-Origin: *`), sin autenticación. | `POST /api/v1/jobs`, `GET /api/v1/jobs/{id}`, `GET /api/v1/jobs/{id}/results`. Rutas heredadas `/simulate` y `/mayor-report` **removidas o restringidas** tras el mismo guardia de autenticación para evitar bypass. |
| **Capacidad de Cómputo** | 1 única Lambda (512 MB, timeout 15 s). Fallo por timeout garantizado para 1.500 corridas completas. | Orquestación desacoplada con **AWS Step Functions Standard** e **Inline Map** (lotes de 25 corridas, concurrencia máxima 4 por job, timeout 120 s por lote, 15 min límite global de workflow). |
| **Persistencia** | Tabla DynamoDB `SpookythonSimulations` definida pero sin uso transaccional de estados. Resultados no persistidos. Scripts en `package.json` limitados a `dev`, `build`, `preview`, `test`. | Tabla DynamoDB única estructurada con clave compuesta (`PK`, `SK`), tres índices secundarios globales (`GSI1`, `GSI2`, `GSI3` disperso para reconciliación), TTL nativo de 7 días y almacenamiento de resultados agregados en **Amazon S3 privado**. Nuevos scripts administrativos y de ingesta etiquetados como tareas a implementar. |
| **Control de Acceso y Privacidad** | Cero autenticación. Cualquier usuario puede saturar el cómputo del backend. | Sistema de **Invitaciones mediante código de alta entropía (>=128 bits)** y **Tokens de sesión opacos (>=256 bits)**. Solo los hashes SHA-256 se almacenan en DynamoDB. Resultados privados por defecto, conmutables a compartidos entre invitados previa verificación fuerte en DynamoDB. |
| **Manejo de Resultados** | Respuesta JSON síncrona completa en el cuerpo HTTP. Riesgo de exceder límites de API Gateway (10 MB). | Descarga de resultados vía **endpoint proxy autenticado de la API**, paginación y separación de trayectoria `run0` de las bandas agregadas P10/P90. Cero presigned URLs públicas o de larga vida. Soporte de compresión gzip en proxy Lambda. |
| **Estrategia con IA** | Mención documental sin implementación funcional en código. | Estrategia declarativa opcional `AI_CORTAFUEGOS` vía **Amazon Bedrock (Nova Micro `amazon.nova-micro-v1:0` en `us-east-1`)**. Máximo 2 intentos totales de invocación por job. Cero LLM en bucle Monte Carlo. Fallback determinista automático y explícito con preservación de salting de RNG existente (`params.seed ^ 0x13579bdf`). |
| **Monitoreo y Costos** | Sin alarmas ni presupuestos activos. Promesa no verificada de "100% Free Tier". | Alarma de presupuesto AWS Budgets ($5.00 USD), cuota por invitación (20 jobs/día) y límite global (100 jobs/día), liberación estricta de slots activos mediante transacción condicional (`slotReleased = false`). Suposiciones de costo acotado, no garantía de gratuidad absoluta. |

---

## 3. Principios de Diseño y Reglas de Oro

1. **Separación Estricta entre Decisión Epidemiológica y Cómputo Numérico:**  
   Ningún LLM genera conteos de infectados, curvas de mortalidad ni predicciones numéricas. La IA genera exclusivamente una **política declarativa de intervención** (pesos, umbrales y prioridades de recursos). El motor estocástico determinista ([`src/domain/seirEngine.ts`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/src/domain/seirEngine.ts)) calcula las trayectorias de contagio y vidas salvadas.
2. **Determinismo y Fidelidad Matemática del Motor Existente:**  
   Se respeta rigurosamente la lógica del motor: la función generadora PRNG combina `(params.seed, strategy, runIndex)`, y la lógica de contagio mezcla la semilla con el nombre de la estrategia. No se asumen números aleatorios comunes (`Common Random Numbers`) entre estrategias porque el motor original ya incluye la estrategia en el salting.
3. **Cero Secretos en Claro y Almacenamiento Hash-Only:**  
   Los códigos de invitación (`SPK-XXXX-XXXX`) y los tokens de sesión (`ses_...`) viajan al cliente vía cookies `HttpOnly; Secure; SameSite=Strict`. En DynamoDB únicamente se almacena `SHA-256(secret)`. Cero tokens o secretos en repositorios, logs de CloudWatch o URLs.
4. **Respeto a la Propiedad de Código del Equipo:**  
   La interfaz gráfica (`src/App.tsx`, componentes de visualización Deck.gl/MapLibre) pertenece al compañero de equipo. El backend se adapta a los contratos de datos esperados por el frontend, entregando esquemas compatibles y extensiones tipadas no destructivas en envelopes versionados (`v2`).
5. **Transparencia Científica y Ética:**  
   El modelo no realiza afirmaciones clínicas. El parámetro de capacidad hospitalaria en la simulación (2.500 casos) representa estrictamente un **umbral efectivo de saturación de contingencia municipal** evaluado frente a la suma total de individuos sintomáticos simultáneos ($\sum I_v(t)$), no un inventario en tiempo real de camas hospitalarias censables desocupadas. Las estadísticas agregadas de camas del INEC/MSP proporcionan contexto estructural, no camas disponibles para triaje. Se reconoce honestamente que la calibración epidemiológica formal y la desagregación barrial están diferidas ante la falta de observaciones distritales de casos en tiempo real.

---

## 4. Cronograma de Implementación (4 Días de Sprint)

| Día | Fase de Ejecución | Entregables Principales | Criterios de Aceptación (DoD) |
| :--- | :--- | :--- | :--- |
| **Día 1** | **Contratos, Modelado y Fixtures** | - Schemas Zod y contratos TypeScript (`src/domain/schemas/`).<br>- Fixtures estáticos con metadatos de procedencia.<br>- Pruebas unitarias de contratos y validación de límites numéricos (17 campos de `SimulationParams`, días 1..60). | - `bun test` ejecuta validaciones de esquemas sin fallos.<br>- Esquema OpenAPI 3.1 generado derivado de tipos formales.<br>- Cero PII en fixtures; etiquetas de procedencia explícitas. |
| **Día 2** | **Acceso, Identidad, Persistencia y API de Jobs** | - Tabla DynamoDB única (`PK`, `SK`, `GSI1`, `GSI2`, `GSI3`).<br>- Módulos de Invitaciones y Sesiones con hashing SHA-256.<br>- CLI administrativo local para generar/revocar invitaciones.<br>- Manejadores de API Gateway para autenticación y Jobs (`POST /jobs`, `GET /jobs`, `GET /jobs/shared`, `GET /jobs/{id}`, `GET /jobs/{id}/results`, `PATCH /jobs/{id}/visibility`). | - Invocación no autenticada devuelve 401 Unauthorized opaco.<br>- Transacción atómica de admisión (cuota global < 100, cuota invitación < 20, slot activo < 1, job PENDING, idempotencia).<br>- Pruebas de integración de aislamiento entre invitaciones pasando. |
| **Día 3** | **Motor Asíncrono y Orquestación** | - Máquina de estados Step Functions (Inline Map, sin `Catch` global en raíz).<br>- Lambda Worker Monte Carlo (lotes de 25 corridas, fencing por attempt en S3 y DDB).<br>- Lambda Agregador con cálculo de P10/Media/P90, extracción de `run0` y finalización exactly-once.<br>- Almacenamiento en S3 privado con particionado inmutable por job y attempt. | - Simulación de 1.500 corridas completada en < 45 segundos.<br>- Consistencia numérica determinista bit a bit contra motor local.<br>- Manejo de fallos parciales sin pérdida de estado ni doble liberación de slot. |
| **Día 4** | **Estrategia IA Opcional, Reconciliación y Demo** | - Integración con Amazon Bedrock (Nova Micro `amazon.nova-micro-v1:0`, presupuesto max 2 llamadas, reserva persistente previa).<br>- Reconciliador programado para jobs huérfanos (consulta GSI3 disperso por dueTime).<br>- Alarmas de CloudWatch y AWS Budgets ($5.00 USD).<br>- Ensayo general de pitch con 2 sesiones independientes. | - Fallback determinista suave a `SMART_CORTAFUEGOS` si Bedrock falla o excede cuota.<br>- Reconciliador libera slots tras 15 min de timeout de forma exactly-once.<br>- Demostración completa de 5 minutos validada en entorno cloud. |

---

## 5. Matriz de Riesgos y Mitigaciones Técnicas

| Riesgo Técnico Identificado | Impacto | Probabilidad | Estrategia de Mitigación en el Plan |
| :--- | :---: | :---: | :--- |
| **Falta de Acceso / Cuota a Bedrock en la cuenta AWS del evento** | Alto | Media | La llamada a Bedrock es **estrictamente opcional**. Se valida la cuenta con un probe en vivo de `Converse` acotado. Si el modelo no responde en 15 s, devuelve JSON inválido o se produce `ThrottlingException`, el sistema ejecuta fallback determinista a `SMART_CORTAFUEGOS` etiquetando explícitamente la procedencia en el resultado (`aiFallback: true`). |
| **Límite de Ejecución / Concurrencia en Lambda** | Medio | Baja | Concurrencia máxima acotada a 4 workers simultáneos por job (Inline Map). El lote de 25 corridas toma ~1,8 s en ARM64, muy por debajo del timeout de 120 s por lote. Concurrencia reservada default de 8. |
| **Saturación de Almacenamiento en DynamoDB (límite 400 KB/ítem)** | Alto | Alta | Los datos pesados de la simulación (series temporales y `run0`) se escriben **directamente a Amazon S3**. DynamoDB solo almacena punteros de clave S3, hashes de validación y contadores de estado. |
| **Inconsistencia de Permisos o Despliegue en CloudFormation** | Alto | Media | Despliegue mediante AWS SAM con verificación previa de cambios (`sam deploy --no-execute-changeset`) y aplicación exacta con `aws cloudformation execute-change-set`. Roles IAM de mínimo privilegio. |
| **Abuso o Sobrecarga en la Demo en Vivo** | Medio | Media | Límite estricto de 20 jobs/día por invitación y 100 jobs/día globales. Transacción atómica en DynamoDB que impide lanzar más de 1 job activo simultáneo por invitación. |

---

## 6. Documentación del Paquete de Planificación

Para revisar el detalle exhaustivo de cada área técnica, consulte los documentos complementarios en este directorio:

* [`design.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/design.md): Diseño detallado de arquitectura, modelo relacional en DynamoDB, máquina de estados Step Functions, especificación de API REST v1 y estrategia Bedrock.
* [`data-sources.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/data-sources.md): Evaluación de fuentes primarias (INEC, MSP, NASA POWER, OSM), taxonomía de certeza, contratos de fixtures y scripts de ingestión.
* [`tasks-and-tests.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/tasks-and-tests.md): Desglose de unidades de trabajo ordenadas por dependencias, metodología TDD estricta (RED-GREEN-REFACTOR) y matriz completa de pruebas.
* [`deploy-and-orca.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/deploy-and-orca.md): Procedimiento de despliegue en AWS con SAM, preflight checks, políticas de rollback/teardown y ciclo de vida de orquestación con Orca.
* [`validation.md`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/validation.md): Reporte de auditoría y verificación formal del checklist de 12 puntos y directivas del coordinador con evidencia archivo:línea.
* [`agents/`](file:///C:/Users/MSI/BRAVO/Documents/ProyectosGit-2026/Yo/SpookythonAWS/docs/backend-demo/agents/): Paquete de 9 fichas de asignación autocontenidas para agentes de implementación especializados.
