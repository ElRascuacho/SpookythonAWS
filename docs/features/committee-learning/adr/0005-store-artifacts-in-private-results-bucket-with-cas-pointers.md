---
status: Accepted
owner: "Architect"
reviewers: ["Security Lead"]
updated_at: "2026-10-27"
feature_size: L
ticket: "committee-learning"
---

# 0005 — Store artifacts in a private results bucket with CAS pointers

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Architect (planning continuation)

## Context

Los manifiestos, snapshots diarios y ledgers superan lo razonable en DynamoDB item size y no deben mezclarse con el bucket frontend público vía CloudFront/OAC de UI.

## Decision drivers

- NFR-06 privacidad; sin URLs públicas de resultados.
- AC-09 reproducibilidad con hashes.

## Considered options

1. **Todo en DynamoDB** — límites de tamaño y coste de lectura.
2. **Presigned URLs al cliente** — riesgo de fuga/enumeración si se filtran.
3. **S3 privado + proxy autenticado API + punteros CAS en DDB** — escritura S3 primero, luego pointer condicional.

## Decision outcome

**Chosen:** Option 3. Artefactos versionados e inmutables; huérfanos expiran por lifecycle 7 días.

## Consequences

**Positive**
- Aislamiento del frontend bucket.
- Publicación atómica vía CAS de metadata.

**Negative**
- Más código de proxy y orphan handling.
- Sin descarga directa CDN.

**Neutral**
- Retention 7 días alineada con ADR-0009.

## Links

- Spec: [[../spec.md]] AC-04, AC-09
- SAD: [[../sad.md]] §5
- Related ADR: [[0002-derive-job-ownership-from-session-nonce-hash]]
