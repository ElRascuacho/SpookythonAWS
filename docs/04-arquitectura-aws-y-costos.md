# Arquitectura AWS Serverless y Declaración de Costos

Esta propuesta busca cumplir los objetivos de la rúbrica: **ejecutar simulaciones Monte Carlo en AWS** (Nivel Pro) y mantener los costos bajos. Las cifras de este documento son estimaciones; no representan facturación verificada de la cuenta AWS.

---

## Alcance acordado para Nivel Pro

El objetivo prioritario es ejecutar el Monte Carlo en AWS. La calibración con datos epidemiológicos reales y la generación de informes con IA quedan como objetivos secundarios: se incorporarán si hay datos verificables, tiempo para validarlos y presupuesto disponible. No se afirmará que el modelo está calibrado sin documentar la procedencia de los datos y su validación.

| Decisión | Alcance |
| :--- | :--- |
| Corridas | 500 corridas por estrategia para las tres estrategias (1.500 corridas en total), conservando la semilla determinista. |
| Resultados | Persistir métricas agregadas y una trayectoria representativa por estrategia; no guardar la trayectoria completa de cada corrida. |
| Informe para el alcalde | Mantener como base el informe determinístico existente. Bedrock queda como mejora opcional, no como dependencia para la entrega. |
| Calibración | Objetivo secundario, sujeto a datos reales verificables y validación del modelo. |

### Propuesta técnica pendiente de implementación

El endpoint síncrono actual no es el flujo objetivo para el Monte Carlo de Nivel Pro. Se propone iniciar el trabajo de forma asíncrona: API Gateway crea un trabajo y devuelve un identificador; Step Functions Distributed Map coordina lotes deterministas en Lambdas con concurrencia acotada; DynamoDB registra el estado del trabajo y S3 almacena el resultado final agregado y las trayectorias representativas. La interfaz consulta el estado y recupera el resultado por identificador.

Distributed Map permite cargas de alta concurrencia y admite hasta 10.000 ejecuciones hijas en paralelo, sujeto a las cuotas de la cuenta y a la concurrencia configurada ([documentación de AWS Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/state-map.html)). La propuesta todavía debe validarse contra las cuotas, permisos y costos de la cuenta AWS antes de desplegarla.

**Estado:** las decisiones de alcance anteriores están acordadas; el flujo asíncrono es una propuesta técnica y todavía no está implementado ni desplegado. El diagrama de abajo corresponde a la propuesta anterior y debe actualizarse para reflejar este flujo antes de usarse como arquitectura objetivo. Las cifras de costo de este documento son estimaciones, no gasto real verificado en la cuenta.

---

## Diagrama de Arquitectura Anterior (`us-east-1`)

```mermaid
flowchart LR
    Jurado["🧑‍⚖️ Jurado / Alcalde\n(Navegador Web 3D)"]
    
    subgraph Publico["Zona Pública (Frontend CDN)"]
        CF["Amazon CloudFront + S3\n(o AWS Amplify Hosting)\nSPA React + MapLibre 3D + Deck.gl"]
    end

    subgraph ServerlessAPI["Capa de API y Cómputo (us-east-1)"]
        APIGW["Amazon API Gateway\n(HTTP API)"]
        LambdaSim["AWS Lambda: Motor Monte Carlo\n(Simulación SEIR-V + Grafo + PRNG)"]
        LambdaAI["AWS Lambda: Resumen Ejecutivo\n(Generador de Boletín del Alcalde)"]
    end

    subgraph DatosIA["Persistencia, IA y Monitoreo"]
        DDB["Amazon DynamoDB\n(On-Demand: Escenarios y Corridas)"]
        Bedrock["Amazon Bedrock\n(Nova Micro / Claude Haiku)"]
        CW["Amazon CloudWatch + AWS Budgets\n(Logs, Métricas y Alerta $5 USD)"]
    end

    Jurado -->|HTTPS| CF
    Jurado -->|POST /simulate\nPOST /mayor-report| APIGW
    APIGW --> LambdaSim
    APIGW --> LambdaAI
    LambdaSim -->|Lee/Guarda Semilla y Resultados| DDB
    LambdaAI -->|Prompt con JSON de Simulación| Bedrock
    LambdaSim --> CW
    LambdaAI --> CW
```

---

## Justificación de Servicios Elegidos

| Servicio AWS | Rol en el Proyecto | Por qué es la mejor decisión arquitectónica |
| :--- | :--- | :--- |
| **AWS Amplify / S3 + CloudFront** | Hosting del Dashboard 3D y Grafo | Entrega estática global con HTTPS automático, cero servidores que mantener y cubierto por el Free Tier. |
| **Amazon API Gateway (HTTP API)** | Punto de entrada REST (`POST /simulate`, `POST /report`) | Hasta 70% más barato y con menor latencia que REST API tradicional; primer millón de llamadas gratis. |
| **AWS Lambda (ARM64 / Graviton2)** | Ejecución del motor Monte Carlo (Nada vs. Azar vs. Estrategia) | Escala instantáneamente durante el pitch, cobra $0 cuando nadie lo usa, y con arquitectura `arm64` ofrece hasta 34% mejor rendimiento/precio. |
| **Amazon DynamoDB (On-Demand)** | Caché determinista por `(seed, params_hash)` e historial de corridas | Si el jurado repite la misma semilla y parámetros, responde en `<15 ms` verificando reproducibilidad instantánea. 25 GB y 200M de peticiones gratis al mes. |
| **Amazon Bedrock (Nova Micro / Haiku)** | Redacción del *"Informe para el Alcalde en lenguaje simple"* (Nivel Pro) | Convierte las métricas matemáticas en un boletín ejecutivo claro para autoridades municipales por ~$0.0001 por reporte. |
| **AWS Budgets + CloudWatch** | Gobernanza de costos y observabilidad | Cumple el requisito obligatorio (`DEBE`) de tener alerta presupuestaria desde el Día 1. |

---

## Seguridad Básica Aplicada (Rúbrica Calidad Técnica 25%)

1. **Cero llaves (`AWS_ACCESS_KEY_ID`) en el código o repositorio:** Todo acceso entre Lambda, DynamoDB y Bedrock utiliza **IAM Roles de ejecución** temporales.
2. **Principio de Mínimo Privilegio (Least Privilege):**
   - El rol de `LambdaSim` solo tiene permisos `dynamodb:GetItem` y `dynamodb:PutItem` sobre el ARN exacto de la tabla `SpookythonSimulations`.
   - El rol de `LambdaAI` solo tiene permiso `bedrock:InvokeModel` sobre el modelo ligero seleccionado.
3. **CORS y Rate Limiting en API Gateway:** Throttling configurado (ej. `20 req/s` burst) para impedir que un bucle accidental dispare costos durante la demo.

---

## Declaración de Costos (Base para `docs/costos.md`)

### 1. Estimación de costos durante la Hackathon (48 horas de desarrollo + día del Pitch)

| Servicio | Uso estimado en el evento | Límite Capa Gratuita (AWS Free Tier) | Costo estimado |
| :--- | :--- | :--- | :---: |
| **AWS Lambda** | ~2,000 ejecuciones (512 MB, ~800 ms c/u) | 1,000,000 ejecuciones + 400,000 GB-s / mes | **$0.00 USD** |
| **API Gateway (HTTP)** | ~2,500 peticiones | 1,000,000 peticiones / mes | **$0.00 USD** |
| **Amazon DynamoDB** | ~4,000 lecturas/escrituras (< 5 MB) | 25 GB + 25 WCU/RCU permanentes | **$0.00 USD** |
| **S3 + CloudFront / Amplify** | ~500 MB transferencia | 5 GB S3 + 1 TB CloudFront / mes | **$0.00 USD** |
| **Amazon Bedrock (Nova Micro)** | ~100 informes para el Alcalde (~800 tokens c/u) | Pago por uso ($0.000035 / 1K input tokens) | **~$0.01 USD** |
| **AWS Budgets + CloudWatch** | 1 Budget con alerta + <50 MB logs | Primer budget gratis + 5 GB logs gratis | **$0.00 USD** |
| **TOTAL ESTIMADO** | | | **~$0.01 USD** |

### 2. Proyección de Costo Operativo Mensual en Producción (GAD Municipal de Manta)

Suponiendo que el Comité de Salud de Manta ejecuta **30,000 simulaciones Monte Carlo al mes** (1,000 corridas diarias de planificación) y genera **1,000 informes ejecutivos** con IA:

- **AWS Lambda (30,000 invocaciones x 1s @ 1024 MB):**
  - Cómputo: $30,000 \times 1\text{ s} \times 1\text{ GB} = 30,000\text{ GB-s}$.
  - Con Free Tier permanente (400,000 GB-s gratis): **$0.00 USD/mes**.
  - Sin Free Tier ($0.0000133334 por GB-s en ARM64 + $0.20/1M req): **$0.41 USD/mes**.
- **Amazon API Gateway (35,000 llamadas HTTP API):** **$0.04 USD/mes** (sin Free Tier).
- **Amazon DynamoDB (On-Demand, 60,000 escrituras/lecturas):** **$0.08 USD/mes** (sin Free Tier).
- **Hosting Frontend (S3 + CloudFront, 10 GB/mes):** **$0.85 USD/mes** (sin Free Tier; **$0.00** con Free Tier).
- **Amazon Bedrock (1,000 reportes con Amazon Nova Micro):** **$0.05 USD/mes**.

> **Costo Mensual Total Estimado:** **$0.05 USD/mes** (con Free Tier activo) o **$1.43 USD/mes** (tarifa plena sin Free Tier).

---

## Checklist de Configuración AWS (Hacer Hoy)

- [ ] Crear **AWS Budget** mensual de `$5.00 USD` con alerta al 80% y guardar captura en `docs/budget.png`.
- [ ] Verificar que todos los recursos se desplieguen en `us-east-1`.
- [ ] Exportar el diagrama definitivo en `docs/arquitectura.png` y su fuente editable `docs/arquitectura.drawio`.

## Siguiente Paso

Revisar el protocolo para la Prueba de Fuego, el Brote Sorpresa y la división del trabajo para los 3 integrantes en [`05-prueba-de-fuego-y-plan-equipo.md`](./05-prueba-de-fuego-y-plan-equipo.md).
