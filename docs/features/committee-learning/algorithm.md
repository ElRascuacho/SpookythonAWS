# Algoritmo exacto — committee-learning v1

> Supuestos del arquitecto para que el coding-agent no decida. Diferente del protocolo de investigación archivado en `evidence/`; no afirmar que este control progresivo ya fue validado experimentalmente.

## 1. Objetivo

Minimizar la **media** de `totalCumulativeInfected` al cierre del horizonte `H` (default 40; UI opcional 20–60 inclusive, paso 1) bajo el mismo escenario, presupuesto diario y recursos. Informar P10/P90 aparte. No optimizar peor caso como primario.

## 2. Familia de política

Vector `w = [w_cordon_early, w_fumigation_early, w_cordon_late, w_fumigation_late]` con cada `w_i ∈ [-3, 3]`.

- Multiplicador de score: `exp(w_i)`.
- Vacuna: factor relativo 1 (no aprendido).
- `w = [0,0,0,0]` ≡ SGC exacto (zero-policy).
- Corte early/late de producto: `earlyLastDay = floor(0.45 * H)` (días 1..earlyLastDay = early; resto hasta H = late).
- Distinguir de la heurística legada SGC `day ≤ 18`: la copia de generación de candidatos SGC conserva umbrales/caps/costos/desempate estable del research `weighted-policy`; el corte 0.45·H solo clasifica qué peso early/late aplica. Zero-policy debe seguir igualando SGC fuente incluso si H ≠ 40.

La política recibe: día actual, estado compartimental, grafo, parámetros de escenario y presupuesto restante del día. **Nunca** futuro, índice de réplica, ni draws RNG ambientales.

## 3. RNG y namespaces

Implementación: Mulberry32 + Box-Muller ya disponibles en scripts de research; fijar versiones y serialización en el manifiesto.

| Stream | Uso | Regla |
| --- | --- | --- |
| `env` | Transiciones SEIR | Namespace **independiente de política** (mismo para todas las políticas comparadas en un pool). No incluir identidad de pesos ni StrategyType aprendido. |
| `search` | CEM / candidatos | Stream dedicado; no colisionar con env. |
| `bootstrap` | IC promoción / final | Stream dedicado; semilla fija en manifiesto. |
| `decision` | Si una política base lo necesita | Separado; política aprendida no consume futuro ambiental. |

RANDOM y NO_INTERVENTION conservan namespaces fuente existentes cuando se evalúan como baselines de auditoría final.

Collision checks: al construir pools, verificar que ningún índice de réplica se reutiliza entre train / selection / promotion / final dentro del job.

## 4. Presupuesto de trayectorias (máximo protocolo)

Warmstarts de library entran dentro de los 24 candidatos/generación; **no** suman llamadas extra.

| Fase | Cálculo | Máximo |
| --- | --- | --- |
| Baseline | 32 × 3 (SGC, RANDOM, NONE) | 96 |
| Training | 8 gen × 24 cand × 8 train | 1536 |
| Selection | campeón+incumbente × 24 × 2 × 8 | 384 |
| Promotion | 64 pares × 2 × 8 | 1024 |
| Final audit | 128 × 4 (candidata, SGC, RANDOM, NONE) | 512 |
| **Total** | | **3552** |

Hard cap de plataforma: ≤ 4096 trayectorias / job y ≤ 480 s soft / 600 s hard. Cancel/timeout puede ejecutar menos; nunca más.

## 5. CEM (búsqueda)

- Generaciones: 8.
- Candidatos/generación: 24 (incluye SGC, searchIncumbent, warmstarts compatibles ≤ library size, resto mutaciones/gaussianas).
- Élites: 6.
- Momento nuevo: 0.7 sobre media/σ de élites.
- σ inicial: 1.3; piso: 0.15.
- Fitness de search: media de **solo** pool train (8 réplicas). **Prohibido** retroalimentar selection/promotion/final hacia centro o searchIncumbent.
- Mantener `searchIncumbent` distinto de `publishedIncumbent`.

## 6. Selección, promoción y auditoría

### Selection (por generación / cierre de búsqueda)

Comparar campeón de train vs searchIncumbent en pool selection fresco. Desempate estable lexicográfico de pesos serializados si medias iguales (documentar en manifiesto); empate de media **no** promociona published.

### Promotion (≤ 8 intentos)

Requisitos simultáneos para publicar ProgressVersion:

1. Media de candidata **estrictamente menor** que incumbente publicado en pool promotion.
2. Upper del bootstrap unilateral 95% de diferencias pareadas (candidata − incumbente) **< 0**, con Bonferroni α = 0.05/8.
3. Candidata congelada (pesos inmutables) **antes** de tocar el pool promotion.

Resamples bootstrap default: 2000; semilla en manifiesto. Limitación: heurística de control de error, no garantía estadística universal.

Empate o fallo → conservar incumbente; no archivar candidata rechazada en library.

### FinalAudit (una sola vez, semillas intactas)

Al completar presupuesto o soft-timeout con candidata viva:

- Evaluar candidata vs SGC vs RANDOM vs NONE en 128 réplicas finales intactas (nunca usadas en train/selection/promotion).
- Aprobar recomendación aprendida solo si media candidata < media SGC **y** upper bootstrap unilateral 95% de (candidata − SGC) < 0.
- Si no: recomendar SGC / policyVersion 0; estado terminal `no-improvement`.
- ProgressVersions previas permanecen como historial no final-approved.
- `stateRevision` siempre crece aunque `recommendedPolicyVersion` vuelva a 0.

Cancel/timeout: conservar última ProgressVersion si existe; `finalAudit = not-run`; no archive a library de una candidata no auditada como final.

## 7. Library global

- Máximo 8 entradas: solo pesos + versiones de compatibilidad (`engine`, `graph`, `policyFamily`, `horizonClass`).
- Sin owner, jobId, seeds ni historia privada.
- Snapshot de library al inicio del job en el manifiesto; seed sola no reproduce tras evolución.
- Al archivar tras FinalAudit favorable: inserción determinista; si lleno, evicción por peor score de archive metadata declarado (FIFO de `archivedAt` si empate).

## 8. Contabilidad de llamadas

Ledger en manifiesto: cada trayectoria con fase, policyId, runIndex, namespace env. Cap 3552 del protocolo; rechazo si el plan excedería 4096. El campo legado de research `totalTrajectories=4483` no aplica al producto.
