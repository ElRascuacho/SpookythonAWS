# Committee policy-learning feasibility experiment

## Scope and provenance

This is research evidence, not an implemented Committee feature or a production model. No AWS requests, dependency installation, application edits, staging or commits were performed.

- Source revision: `4bcdc6e251c4ad02c350a15e35e3af1bb5e0ab5d`.
- Main run completed at `2026-10-28T04:21:37.379Z`.
- Local runtime: Bun `1.3.14`, Windows x64.
- Main search/validation/final evaluation: **107.4908002 seconds wall**, **98.687 CPU seconds**, final RSS **111.296875 MiB**. Adapter generation and parity checks precede this timer.
- **4,480 search/validation/final trajectories** plus **21 parity simulator calls** = **4,501 main experiment simulator calls**. A supplementary frozen-policy check then made **12 invariant runs and two deterministic repeats**, for **4,515 calls overall**. The raw JSON field `totalTrajectories: 4483` counts only instrumented research-wrapper calls, including three weighted-policy parity calls but excluding the other 18 parity calls. `checks.json` disambiguates the accounting; raw observations were not rewritten.

## Candidate family and search

Every policy remains adaptive: each day it receives the current compartment state and the scenario parameters, then chooses actions within the daily budget. It never sees future random draws, a future trajectory, the run index or training score. Although the existing parameter object contains the base seed, the copied policy does not inspect it; the eventual application interface should omit random-stream fields entirely.

The copied SGC candidate-generation rules, thresholds, daily caps, vaccine eligibility, costs and tie-preserving sorting are unchanged. Four learned values multiply candidate scores:

1. Cordon log multiplier for days 1–18.
2. Fumigation log multiplier for days 1–18.
3. Cordon log multiplier for days 19–40.
4. Fumigation log multiplier for days 19–40.

Each multiplier is `exp(weight)`, with weights bounded to `[-3, 3]`. Vaccine score has relative multiplier one. The zero vector is exactly the existing SGC policy. This deliberately narrow family cannot discover arbitrary novel intervention logic.

Search is a reproducible, smoothed diagonal-Gaussian elite search, described as CEM-style rather than a certified library implementation: eight generations, 24 candidates per generation, six elites, 0.7 weight on new elite moments, standard-deviation floor 0.15, initial standard deviations 1.3. Each generation includes unchanged SGC, its incumbent, fresh candidates and Gaussian mutations. The second scenario also includes the first scenario's selected policy as a warm-start candidate. Policy weights are adjusted using the mean of eight simulation outcomes, not one lucky trajectory.

Black-box policy optimization is a legitimate alternative to gradient-based reinforcement learning; see the inspected primary paper [Salimans et al. (2017)](https://arxiv.org/abs/1703.03864). That paper does not validate this particular simulator, parameter family or search budget.

## Scenario, randomness and independence

Both scenarios use 16 Manta nodes, 40 days, USD7,500/day, vaccine efficacy 0.85, the repository's current intervention costs, base seed `20261030`, initial node N01, 35 infectious and 50 exposed people.

- Standard: `betaHuman=0.3`, `betaVector=0.045`, vaccine lot 850.
- Shifted: `betaHuman=0.6`, `betaVector=0.045`, vaccine lot 425.

The same scenario and horizon are used for every compared policy. The objective is cumulative infections at day40; this does not establish prevention after day40.

Three disjoint pools of run indices are fixed before evaluation:

| Purpose | Run indices | Use |
|---|---|---|
| Training | 0–7 | Fitness of every generated candidate |
| Validation | 1000–1023 | Select from seven training finalists plus unchanged SGC |
| Final test | 100000–100127 | Evaluate frozen selected candidate, SGC, RANDOM and NO_INTERVENTION |

Per scenario: 1,536 training trajectories, 192 validation trajectories and 512 final trajectories. The winner is written to `frozen-<scenario>.json` before the final pool is touched. Final results never influence the search or candidate choice. The second scenario reuses the first selected weights, not its final-test measurements.

All learned candidates and the SGC reference use the **same fixed `SMART_CORTAFUEGOS` environmental RNG namespace**. Policy weights or identifiers do not change the environmental seed identity. RANDOM and NO_INTERVENTION retain their existing source namespaces. These are matched-seed comparisons; state-dependent binomial branches can consume different numbers of random draws, so this is not a guarantee of identical random noise per node and transition.

## Results on 128 untouched final replicates per scenario

| Scenario | Selected policy mean infections | SGC | RANDOM | No intervention | Reduction vs SGC |
|---|---:|---:|---:|---:|---:|
| Standard | 164,576.5625 | 164,576.5625 | 232,753.0546875 | 267,138.9609375 | **0%: tie** |
| Double transmission + half doses | 239,930.453125 | 247,397.34375 | 257,766.5078125 | 269,978.515625 | **3.018177%** |

Paired differences are selected-policy infections minus SGC infections:

- Standard: mean difference **0**, paired bootstrap 95% interval **[0, 0]**.
- Shifted: mean difference **−7,466.890625**, paired bootstrap 95% interval **[−7,570.8203125, −7,361.828125]**. Bootstrap uses 2,000 resamples of matched final pairs and a separate fixed RNG seed.

Mean intervention spending remains within the same available budget:

- Standard: both USD281,931.25 over 40 days.
- Shifted: learned USD267,617.1875; SGC USD283,045.3125.

The standard search selected nonzero weights under its tie-breaker, but the tested resulting actions/outcomes equal SGC. **This must not count as learned improvement or trigger promotion.** Production should preserve the incumbent on a tie and require positive independent evidence before publishing an update.

Exact selected weights and per-replicate observations are in `results.json`; do not round them for a rerun.

## Adapter integrity and invariants

`run-experiment.ts` reads current source into temporary files and performs only:

- Import-path relocation for scratch execution.
- An optional policy callback at the existing daily decision seam.
- The four score multipliers in a copy of SGC.

Epidemiological equations, random streams, initialization and outcome accounting are unchanged. Every string transformation requires a unique source match and fails otherwise.

Exact deep equality of source versus scratch engine was established for three base seeds (`0`, `20261030`, `987654321`) across SGC, RANDOM and NO_INTERVENTION. The zero-weight policy additionally equals source SGC for all three seeds, including every daily action, snapshot and metadata field.

All 1,024 final runs plus three weighted-policy parity runs passed population conservation, nonnegative finite compartments, daily budget bounds and existing zero-wasted-dose checks. Supplementary runs independently checked that vaccine orders never exceed start-of-day susceptible counts and that reported costs equal purchased lots/cordons/fumigation orders. Two frozen-policy repeats reproduced infection and budget totals exactly.

## Reproduction and artifacts

The runner assumes it resides at `.git/committee-experiment/run-experiment.ts`. If it is archived under feature documentation, copy it to that scratch location before execution; do not run it directly from a different directory. Run commands from the repository root:

```powershell
bun .git/committee-experiment/run-experiment.ts
bun .git/committee-experiment/check-frozen.ts
```

Files:

- `run-experiment.ts`: reproducible scratch adapter generator and search.
- `check-frozen.ts`: supplementary invariant and deterministic-repeat checks.
- `adapted-engine.ts`, `weighted-policy.ts`: generated, source-derived scratch modules; regenerated by runner.
- `results.json`: raw measurements, history, selected weights and final replicate rows.
- `frozen-standard.json`, `frozen-double-transmission-half-vaccines.json`: candidates frozen before final evaluation.
- `checks.json`: independent checks and correct call-accounting explanation.
- `run.log`: captured execution progress and summary.

The experiment uses no package beyond the repository's existing Bun/TypeScript environment. The source transformation is intentionally strict; source seam changes require a new parity check rather than silently continuing.

## Decision implication and limits

**Evidence supports a bounded v1 experiment based on an explainable, low-dimensional learned policy. It does not support an always-improves claim.** The shifted scenario shows a held-out gain; the standard scenario provides direct evidence that more search can produce no useful improvement and must retain SGC.

Remaining limitations are explicit: two scenarios, one main base seed, only eight training and24 validation replicates, narrow action-score family, existing simulator assumptions and no independent cloud timing. More base seeds/scenarios are necessary before a broad robustness claim. Final bootstrap evidence is exploratory and not a sequential-promotion policy; the product needs fresh evaluation pools and rules for repeated updates.

This is not a production learner, a trained neural network, an optimality proof, a calibrated health recommendation, or a measured AWS cost. Local Bun/x64 timings must **not** be converted into billed Node/ARM Lambda duration. Actual worker profiling and conservative admission quotas remain required before enabling the USD5/month AWS pilot.
