# Epic — committee-learning

Modo Comité: búsqueda privada asíncrona de políticas de 4 pesos con promoción progresiva y auditoría final, sin reemplazar juego/campaña.

## DAG

```mermaid
flowchart TD
  T1[T1 engine seam]
  T2[T2 weighted policy]
  T3[T3 seed manifest]
  T4[T4 CEM]
  T5[T5 promotion/final]
  T6[T6 runner]
  T7[T7 ownerHash]
  T8[T8 SAM]
  T9[T9 DDB admission]
  T10[T10 S3 library]
  T11[T11 API]
  T12[T12 worker]
  T13[T13 ModeShell]
  T14[T14 form/poll]
  T15[T15 playback]
  T16[T16 integration/chaos]
  T17[T17 profile harness]
  T18[T18 release evidence]

  T1 --> T2 --> T4 --> T5 --> T6
  T3 --> T4
  T7 --> T9
  T8 --> T9
  T8 --> T10
  T9 --> T11
  T10 --> T11
  T6 --> T12
  T9 --> T12
  T10 --> T12
  T13 --> T14
  T11 --> T14 --> T15
  T11 --> T16
  T12 --> T16 --> T17
  T12 --> T17
  T15 --> T18
  T16 --> T18
  T17 --> T18
```

## Parallel waves

| Wave | Tasks |
| --- | --- |
| 1 | T1, T3, T7, T8, T13 |
| 2 | T2, T9, T10 |
| 3 | T4, T11 |
| 4 | T5, T14 |
| 5 | T6, T15 |
| 6 | T12 |
| 7 | T16 |
| 8 | T17 |
| 9 | T18 |

Serialize overlapping `files_hint` lanes (esp. `backend/handler.ts`, `src/InvitationGate.tsx`).

## Coding-only

Usar el prompt en [`../README.md`](../README.md). No deploy sin ReleaseOperator.
