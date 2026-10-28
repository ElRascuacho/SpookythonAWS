---
status: Accepted
owner: "Architect"
reviewers: ["Security Lead", "Tech Lead"]
updated_at: "2026-10-27"
feature_size: L
ticket: "committee-learning"
---

# 0002 — Derive job ownership from session nonce hash

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** Architect (planning continuation)

## Context

Los códigos de invitación son compartidos. La cookie `manta_session` incluye `codeHash.expiry.randomNonce.signature`. Si la propiedad del job se atara al codeHash, cualquier portador del mismo código vería resultados ajenos.

## Decision drivers

- AC-04 autorización entre sesiones.
- NFR-06: 0 accesos cruzados.
- Preservar contrato cookie/login JSON existente.

## Considered options

1. **Owner = codeHash** — rompe aislamiento entre invitados que comparten código.
2. **Owner = UUID opaco solo en cliente** — el cliente no es autoridad.
3. **OwnerHash = HMAC/SHA del nonce de sesión validado en servidor** — privado por login.

## Decision outcome

**Chosen:** Option 3. Tras validar la cookie, el servidor deriva `ownerHash` del nonce; toda ruta Committee exige coincidencia. Nuevo login ⇒ nuevo nonce ⇒ pierde acceso a jobs previos (documentado).

## Consequences

**Positive**
- Aislamiento real pese a invitaciones compartidas.
- No cambia el wire format de la cookie.

**Negative**
- Recarga de sesión/login no recupera historial previo.
- Hay que evitar filtrar existencia en denegaciones.

**Neutral**
- Helper compartido de auth se introduce después de validar el diseño (no antes).

## Links

- Spec: [[../spec.md]] AC-04
- SAD: [[../sad.md]] §8
- Related ADR: [[0005-store-artifacts-in-private-results-bucket-with-cas-pointers]]
