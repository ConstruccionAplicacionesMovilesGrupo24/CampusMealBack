# Sprint 4 / S4-09: Session, crash and meal-comparison latency telemetry (BQ1)

Tracking issue: [Sprint-2-Kotlin #48](https://github.com/ConstruccionAplicacionesMovilesGrupo24/Sprint-2-Kotlin/issues/48) (S4-09).
Owner: Daniel (@dvargasl2). Reviewer: Juan Pablo (@bedoya0611).
Android counterpart: S4-10 / #49. Frozen scope: `android/docs/SPRINT4_SCOPE.md` §5.3 in Sprint-2-Kotlin.

## 1. Business question

**BQ1 — Type 1 (original Sprint 1 wording):**
"Which device model, operating-system version, and application version combinations have a crash rate above 1% or a
95th-percentile loading time above two seconds on the meal-comparison screen?"

| Part of the question | Data source |
|---|---|
| Device model, OS version, app version | Columns of each `performance_events` record |
| Crash rate | `FATAL_CRASH` over `SESSION_START` |
| p95 loading time on meal comparison | `COMPARISON_LOAD` with outcome `FRESH_NETWORK` |

## 2. Endpoints

### 2.1 `POST /api/v1/analytics/performance-events` (any authenticated user) → `202`

A dedicated endpoint: nothing is added to the strict `POST analytics/usage-events` DTO.

| Field | Types | Rule |
|---|---|---|
| `clientEventId` | all | UUID |
| `eventType` | all | `SESSION_START` \| `FATAL_CRASH` \| `COMPARISON_LOAD` |
| `platform` | all | `ANDROID` \| `IOS` |
| `deviceModel`, `osVersion`, `appVersion` | all | Printable text, at most 80 / 40 / 40 characters |
| `occurredAt` | all | ISO-8601 UTC ending in `Z`; at most 5 minutes in the future and 90 days old |
| `sessionId` | session, crash (required); load (optional) | UUID |
| `loadId`, `outcome` | load (required) | UUID; `FRESH_NETWORK` \| `CACHED_RESTORE` \| `OFFLINE_HISTORY` \| `ERROR` \| `TIMEOUT` \| `CANCELLED` |
| `durationMs` | load | Integer 0–600000; required when the outcome showed content |
| `exceptionClass` | crash (optional) | Class name only; a message or a stack trace is a 400 |
| `injected` | crash (optional) | `true` when an internal build provoked the crash on purpose |
| `screen` | optional | Coarse screen name; a load is always `MEAL_COMPARISON` |

A field of another record type (for example `durationMs` on a session) is rejected, not dropped. The owner is always the
access token's user; `synthetic` cannot be sent. No tokens, coordinates, exception messages or stack traces are accepted.

### 2.2 `GET /api/v1/analytics/performance?from=…&to=…&includeSynthetic=false` (`ANALYST` only)

Bogotá calendar dates, inclusive, at most 92 days, `to` not after today. `USER` → 403; no token → 401.

Top level: `contractVersion`, `from`, `to`, `generatedAt`, `includeSynthetic`, `includesSyntheticData`, `thresholds`,
`samplePolicy`, `combinations[]` (flagged first), `coverage`, `limitations[]`.

## 3. Definitions

| Term | Definition |
|---|---|
| Combination | `platform` + `deviceModel` + `osVersion` + `appVersion` of the record |
| Started session | One `SESSION_START` per account and `sessionId` whose `occurredAt` is in the window |
| Crashed session | A started session with a `FATAL_CRASH` of the same account and `sessionId`, whenever it was delivered. Counted once |
| `crashRate` | crashed ÷ started; `null` without sessions |
| Fresh load | `COMPARISON_LOAD` with outcome `FRESH_NETWORK`: the backend answered and that content was rendered |
| `p95Ms` | Nearest rank: the value at position `ceil(0.95 n)` of the sorted fresh loads, computed with integers as `(95 n + 99) / 100`; `null` without them |
| `failureRate` | (errors + timeouts) ÷ (fresh + errors + timeouts). Failed loads are not in the p95, so a low p95 with a high `failureRate` is survivorship bias, not good performance |
| Flag | `crashed × 100 > started` (strictly above 1%) or `p95Ms > 2000` |
| `confidence` | `NO_DATA` (zero denominator), `INSUFFICIENT` (fewer than 100 sessions / 20 fresh loads), `SUFFICIENT` |

Why 100 and 20: below 100 sessions one single crash is already above 1%, and below 20 loads the nearest-rank p95 is simply
the slowest load. The flag is still shown, together with the label, so a small sample is never hidden nor presented as a
population result.

## 4. Counting once

| Situation | Protection |
|---|---|
| Retry, lost acknowledgement, outbox replay | Unique `(user_id, client_event_id)` |
| A session start or a crash imported twice with different event ids | Unique `(user_id, session_id, event_type)` for both types |
| Two outcomes reported for one load | Unique `(user_id, load_id)`: the first terminal outcome is kept |
| Concurrent requests | All inserts use `ON CONFLICT DO NOTHING` |
| Event delivered days later | `occurredAt` decides the window, so past windows are updated; `coverage.lateEvents` counts them and `lateSyncPossibleUntil` says until when the window may still change |

## 5. Coverage and limitations

| Limitation | Consequence |
|---|---|
| Only fatal JVM exceptions captured by the app's handler | Native crashes, ANRs, force-stops and system kills are **not** crashes here. This is a monitored crash rate, not exhaustive platform crash capture |
| A crash is delivered when the app is opened again | A device that never reopens the app is missing from the numerator |
| A crash can arrive without its session start | Reported as `coverage.crashesWithoutSession` and left out of the rate, which therefore cannot exceed 1 |
| Crashes injected for a demo | The whole session leaves both sides of the rate (`coverage.excludedInjectedSessions`) unless `includeSynthetic=true` |
| Demo rows (`seed:bq1`) | Excluded by default; a combination that contains them says `synthetic: true` |
| Only clients that send these events appear | `coverage.platforms` lists them; at this point only Android is planned to |
| Device model cells are not suppressed below 5 users | The §5 suppression rule of the scope covers behavioral and review aggregates. This report is technical, has no account or session id and only reaches analysts; suppressing it would hide every combination of a small test group. The small-sample label is used instead (`SPRINT4_SCOPE.md` §5.3). **To be confirmed by the reviewer** |

## 6. Synthetic fixtures (`npm run seed:bq1`)

Anchor `BQ1_SEED_DATE` (default `2026-11-20`); 5 inactive users; 539 rows with `synthetic = true`. Re-running it is a no-op.

| Combination | Sessions | Crash rate | Fresh loads | p95 | Flagged |
|---|---|---|---|---|---|
| Demo A | 100, 1 crash | 0.01 (not above 1%) | 94 × 1000 + 6 × 2500 | 2500 | p95 |
| Demo B | 100, 2 crashes | 0.02 | 20 × 2000 | 2000 (not above 2 s) | crash |
| Demo C | 0 | `null` | 0 (2 cached, 1 history, 3 errors, 2 timeouts, 1 cancelled) | `null`, `failureRate` 1 | no |
| Demo D | 3, 1 crash + 1 crash without session | 0.3333, `INSUFFICIENT` | 1 × 5000, `INSUFFICIENT` | 5000 | both |
| Demo E | 100, 0 crashes | 0 | 95 × 1000 + 5 × 2500 | 1000 | no |

Demo A and E are the two sides of the percentile boundary: position 95 of 100 is the first 2500 in A and the last 1000 in E.

## 7. Validation record

Run on 2026-11-25 against a **disposable local** PostgreSQL 18 container. Neon and Render were not touched.

| Check | Observed |
|---|---|
| `migration:run` → `migration:revert` → `migration:run` | Succeeded |
| `typeorm schema:log` after migrating | "Your schema is up to date" |
| `seed:bq1` twice | 539 rows both times (303 sessions, 5 crashes, 231 loads) |
| `npm run build`, `npm run lint` | Success, no lint errors |
| `scripts/verify-s4-09.sh` | 55 checks, all passed: ingestion and replays (10), validation (15), access and range (5), real records of the run (9), fixtures (16) |

Pending: the same script against Render + Neon after deployment, recorded by the owner.

## 8. Deployment (Render + Neon)

Additive: one new table; existing endpoints, the Android 0.4.0 app and the Swift app are unaffected.

```bash
npm run build
node --env-file=.env.render node_modules/typeorm/cli.js -d dist/database/data-source.js migration:show
node --env-file=.env.render node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run
# Optional, only for the demo: synthetic rows, hidden unless includeSynthetic=true
node --env-file=.env.render dist/database/seeds/bq1.seed.js
```

## 9. Differences from the frozen scope (`SPRINT4_SCOPE.md` §5.3)

All additive:

| Scope | Implemented | Why |
|---|---|---|
| — | Optional `injected` on `FATAL_CRASH` | The issue asks to keep fault-injection data separate from real usage |
| — | Optional `screen` | Listed in the issue; loads are always `MEAL_COMPARISON` |
| `COMPARISON_LOAD` has `loadId` | It may also carry `sessionId` | Lets loads of an injected-crash session be excluded too |
| — | `includeSynthetic` (default `false`) | Same rule as BQ13 |
