# Costos verificables de Operación Manta Cero

**No hay garantía de gratuidad ni de corte automático por presupuesto.** El costo
depende del uso, tarifas, créditos y condiciones de la cuenta. Esta declaración
separa evidencia provisional, supuestos y valores aún pendientes.

## Evidencia de cuenta consultada el 27 de octubre de 2026

Consulta de solo lectura comunicada por el preflight del equipo:

| Evidencia | Resultado y alcance |
| --- | --- |
| AWS Cost Explorer | `UnblendedCost=0 USD`, `NetUnblendedCost=0 USD`, `Estimated=true` |
| Período de Cost Explorer | 2026-10-01 incluido a 2026-10-28 excluido; total de cuenta, no factura final del evento |
| AWS Budgets | Presupuesto mensual de costo: **1 USD**; gasto real calculado **0 USD** |
| Alerta | Gasto real mayor que **0,01 USD**, umbral absoluto; estado `OK`, un suscriptor de correo (sin publicar su dirección) |
| Actualización de Budget | 2026-10-27 12:38:40 UTC |
| Lambda | ARM64, Node.js 20, **512 MB**, timeout 15 s |
| Métrica diaria Lambda consultada | 65 invocaciones; duración media 175,379846 ms, máxima 4148,11 ms (ventana del 27 de octubre) |

El cero provisional no acredita costo final cero ni habilitación Free Tier. Falta
actualizar el gasto al cerrar el evento y separar otros recursos de la cuenta.
La [captura histórica del Budget](./images/aws-budget.png) puede no coincidir con
el presupuesto actual consultado. No demuestra por sí sola que estuvo activo
desde el primer día. La alerta notifica; no limita automáticamente invocaciones.

## Estimación mensual con cálculo visible

Escenario ilustrativo, **no medición de demanda**: 30.000 solicitudes API/mes,
una invocación Lambda por solicitud, 512 MB y duración media redondeada a 0,176 s
del pequeño muestreo anterior. Ese promedio mezcla rutas; no es un benchmark de
Monte Carlo de 500 corridas. Las noticias con proveedor pueden durar mucho más.

| Componente | Fórmula sin aplicar créditos ni capa gratuita |
| --- | --- |
| Lambda ARM64 cómputo | `30.000 × 0,176 s × 0,5 GB = 2.640 GB-s`; `2.640 × 0,0000133334 USD = 0,035200176 USD` |
| Lambda solicitudes | `30.000 / 1.000.000 × 0,20 USD = 0,006 USD` |
| API Gateway HTTP API | `30.000 / 1.000.000 × 1 USD = 0,03 USD` para el primer tramo, solicitudes pequeñas |
| Subtotal API + Lambda | **0,071200176 USD/mes**, aproximadamente **0,0712 USD**; NO es el total de la solución |
| S3 | `GB-mes almacenados × tarifa regional + PUT/GET × sus tarifas`; volumen y tarifa aplicable pendientes |
| CloudFront | `GB transferidos × tarifa por geografía/plan + solicitudes × tarifa + invalidaciones facturables`; tráfico/plan pendientes |
| CloudWatch | `GB ingeridos × tarifa + GB-mes retenidos × tarifa + métricas/consultas facturables`; volúmenes y retención pendientes |
| DynamoDB provisionado | Handler actual: **0 lecturas/escrituras de aplicación previstas**; sumar almacenamiento/uso ajeno real si existe |
| OpenAI opcional | `tokens de entrada / unidad × tarifa modelo + tokens de salida / unidad × tarifa modelo`; separar de factura AWS |
| Otros | Incluir impuestos, transferencia aplicable y cualquier recurso de cuenta no enumerado antes de cerrar la declaración |

**Total mensual estimado = 0,0712 USD + S3 + CloudFront + CloudWatch + demás uso
facturable + OpenAI si se habilita.** Los términos pendientes impiden declarar un
total mensual final fiable. Sustituye los volúmenes y tarifas en la tabla y adjunta
la fecha/fuente antes de presentar una cifra cerrada al jurado.

El motor de la partida y la evaluación de la UI corren en el navegador; no generan
una invocación Lambda por réplica. `/simulate` y `/mayor-report` son síncronos.
El handler empaquetado no invoca Bedrock ni persiste en DynamoDB. El preflight
confirmó ausencia de `OPENAI_API_KEY`: noticias desplegadas en fallback, sin tokens
de OpenAI atribuibles a esa configuración. No extrapolarlo a otros despliegues.

## Fuentes y cierre

Tarifas de ejemplo consultadas el 27 de octubre de 2026 para `us-east-1`:
[Lambda ARM y solicitudes](https://aws.amazon.com/lambda/pricing/) y
[API Gateway HTTP API](https://aws.amazon.com/api-gateway/pricing/).
Los importes de Lambda y API anteriores usan esas tarifas de lista, no descuentos.
Para completar los términos pendientes consulta
[S3](https://aws.amazon.com/s3/pricing/),
[CloudFront](https://aws.amazon.com/cloudfront/pricing/),
[CloudWatch](https://aws.amazon.com/cloudwatch/pricing/),
[DynamoDB](https://aws.amazon.com/dynamodb/pricing/) y
[OpenAI](https://openai.com/api/pricing/). No asumir elegibilidad de créditos o
franquicias sin comprobar las condiciones de la cuenta.

- [ ] Sustituir gasto provisional por factura/export del período completo.
- [ ] Completar almacenamiento, transferencia, logs y términos pendientes.
- [ ] Renovar captura de Budget, ocultando identificadores y correo.
- [ ] Reconciliar el total con Cost Explorer/Billing antes del pitch.
