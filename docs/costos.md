# Declaración de Costos en AWS — Operación Manta Cero

Este documento detalla el cálculo de costos mensuales proyectados y el gasto real incurrido durante la Hackathon Spookython AWS en la región `us-east-1` (N. Virginia), cumpliendo el criterio de **Costos (10% + criterio de desempate)** de la rúbrica oficial.

---

## 1. Resumen Ejecutivo de Costos

| Escenario | Costo con AWS Free Tier | Costo Tarifa Plena (Sin Free Tier) |
| :--- | :---: | :---: |
| **Gasto Real Durante la Hackathon (48h + Pitch)** | **$0.01 USD** | $0.03 USD |
| **Operación Mensual Estimada (Comité de Salud de Manta)** | **$0.05 USD / mes** | **$1.43 USD / mes** |

> **Decisión de diseño clave:** Se descartó el uso de instancias EC2, RDS, NAT Gateways o clústeres ECS Fargate 24/7. Toda la arquitectura es **100% Serverless orientada a eventos**, por lo que el costo en reposo (*idle cost*) es exactamente **$0.00 USD**.

---

## 2. Desglose del Cálculo Mensual en Producción (`us-east-1`)

**Supuesto de carga mensual:** El Comité de Operaciones de Emergencia (COE) de Manta ejecuta **1,000 lotes de simulación Monte Carlo por día** (`30,000 invocaciones/mes`, 200 corridas por lote) y solicita **1,000 boletines ejecutivos para el Alcalde** al mes.

| Servicio AWS | Fórmula de Cálculo Visible | Con AWS Free Tier | Sin Free Tier (Tarifa Plena) |
| :--- | :--- | :---: | :---: |
| **AWS Lambda (ARM64)** | $30,000 \text{ req} \times 1.0\text{ s} \times 1\text{ GB} = 30,000\text{ GB-s}$<br>Tarifa: $\$0.0000133334/\text{GB-s} + \$0.20/1\text{M req}$ | **$0.00 USD**<br>*(400,000 GB-s gratis/mes)* | **$0.41 USD** |
| **Amazon API Gateway (HTTP API)** | $35,000 \text{ llamadas REST/mes}$<br>Tarifa: $\$1.00 / 1\text{M peticiones}$ | **$0.00 USD**<br>*(1M gratis por 12 meses)* | **$0.04 USD** |
| **Amazon DynamoDB (On-Demand)** | $30,000 \text{ escrituras (WRU)} + 60,000 \text{ lecturas (RRU)}$<br>Almacenamiento $< 0.2\text{ GB}$ | **$0.00 USD**<br>*(25 GB gratis permanentes)* | **$0.08 USD** |
| **Hosting Web 3D (S3 + CloudFront)** | $1\text{ GB almacenamiento S3} + 10\text{ GB transferencia CloudFront}$ | **$0.00 USD**<br>*(1 TB CloudFront gratis/mes)* | **$0.85 USD** |
| **Amazon Bedrock (Nova Micro)** | $1,000 \text{ reportes} \times (800 \text{ in} + 400 \text{ out tokens})$<br>Tarifa: $\$0.000035/1\text{K in} + \$0.00014/1\text{K out}$ | **$0.05 USD** | **$0.05 USD** |
| **AWS Budgets + CloudWatch** | $1 \text{ presupuesto con alerta} + < 500\text{ MB de logs}$ | **$0.00 USD**<br>*(5 GB logs gratis permanentes)* | **$0.00 USD** |
| **TOTAL MENSUAL** | | **$0.05 USD / mes** | **$1.43 USD / mes** |

---

## 3. Gasto Real Durante el Evento

- **Presupuesto configurado en AWS Budgets:** `$5.00 USD / mes` con alerta temprana al `80%` (`$4.00 USD`).
- **Evidencia del AWS Budget:** Ver captura oficial en `docs/budget.png`.
- **Gasto acumulado en AWS Billing Console durante la hackathon:** **~$0.01 USD** (correspondiente únicamente a las invocaciones de prueba de Amazon Bedrock; el resto de servicios permaneció 100% dentro de la capa gratuita).
