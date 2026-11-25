# Sprint 4 / S4-03: Structured restaurant reviews, menu revisions and BQ13

Tracking issue: [Sprint-2-Kotlin #39](https://github.com/ConstruccionAplicacionesMovilesGrupo24/Sprint-2-Kotlin/issues/39) (S4-03).
Owner: Juan Pablo (@bedoya0611). Reviewer: Natalia (@NataliaEspitia).
Android counterpart: S4-04 / #40. Frozen scope: `android/docs/SPRINT4_SCOPE.md` §5.1 in Sprint-2-Kotlin.

## 1. Business question

**BQ13 — Type 4 (original Sprint 1 wording):**
"Which restaurant partners keep menus and prices updated within a seven-day window, and does that update
frequency correlate with higher student selection rates and review scores?"

| Part of the question | Data source in this backend |
|---|---|
| Menus and prices updated | `menu_revisions` (new, append-only) |
| Within a seven-day window | `menuStatus` at the report cutoff date |
| Student selection rates | BQ8 impressions/selections (`analytics_events`) of WALK/ORDER alternatives |
| Review scores | `restaurant_reviews` (new, structured, self-reported) |
| Correlate | Spearman rank correlation across restaurants, observational |

## 2. Endpoints

### 2.1 `POST /api/v1/restaurants/{restaurantId}/reviews` (any authenticated user)

```json
{
  "clientReviewId": "3f1c2b9e-7a54-4d0e-9b61-2c8e5f7a1d03",
  "overall": 4, "portion": 3, "taste": 5, "freshness": 4, "value": 3,
  "waitMinutes": 12,
  "occurredAt": "2026-11-23T17:05:00Z"
}
```

| Rule | Behavior |
|---|---|
| Scores | Integers 1–5 (`overall`, `portion`, `taste`, `freshness`, `value`); `waitMinutes` integer 0–180 |
| No free text | Unknown fields (e.g. `comment`) → 400 by the global whitelist; nothing to moderate |
| Author | Always the access token's user; never accepted in the body, never returned by reads |
| `occurredAt` | ISO-8601 UTC ending in `Z`; at most 5 minutes in the future and 30 days old (an offline review may wait in the Android outbox) |
| Review day | `reviewDate` = America/Bogota date of `occurredAt` |
| Restaurant | Must exist and be active, else `404 RESTAURANT_NOT_FOUND` |
| First submission | `201` + receipt |
| Same `clientReviewId`, same content | `200` + the **same** receipt (idempotent replay after a lost acknowledgement) |
| Same `clientReviewId`, different content | `409 CLIENT_REVIEW_ID_CONFLICT` |
| New `clientReviewId`, same restaurant and Bogotá day | `409 REVIEW_ALREADY_SUBMITTED_TODAY` |

Both uniqueness rules are unique indexes (`UQ_restaurant_reviews_user_client_review`,
`UQ_restaurant_reviews_user_restaurant_day`); the insert uses `ON CONFLICT DO NOTHING`, so concurrent replays
of one review store one row (§7, check 11).

Receipt: `{ contractVersion: 1, reviewId, clientReviewId, restaurantId, reviewDate, createdAt }`.

For the Android outbox (`REVIEW` kind): 200/201 → `SENT`; 409 and 400/404 → permanent failure shown to the user;
401/408/429/5xx/network → retry with the same `clientReviewId`.

### 2.2 `GET /api/v1/restaurants/{restaurantId}/reviews?limit=20&includeSynthetic=false` (any authenticated user)

- `summary`: `reviewCount`, `distinctReviewers`, means of the five scores and of `waitMinutes`, `source: STUDENT_SELF_REPORTED`.
- `recent`: newest first, `limit` 1–50 (default 20). Only `reviewDate` and the scores: no author, no time of day.
- With **1–4 distinct reviewers** every summary value is `null`, `suppressed: true`, and `recent` is empty
  (individual rows would reveal the suppressed mean). With **0** reviewers the count is `0`, not suppressed.
- `catalogRating: { value, provenance: "CATALOG_SEED" }` is the seeded `restaurants.average_rating`. It is
  reported separately and never mixed into review means.
- Synthetic seed reviews are excluded unless `includeSynthetic=true`; `includesSyntheticData` says whether
  any contributed.

### 2.3 `GET /api/v1/analytics/partner-health?from=…&to=…&includeSynthetic=false` (`ANALYST` only)

Parameters: Bogotá calendar dates, inclusive, `from ≤ to`, at most 92 days, `to` not after today.
`USER` → 403; no token → 401.

Top level: `contractVersion`, `from`, `to`, `cutoff`, `freshnessWindow {days, from, to}`, `generatedAt`,
`includeSynthetic`, `includesSyntheticData`, `revisionHistoryStartsAt`, `minDistinctUsers`,
`restaurants[]`, `cohorts[]`, `associations[]`, `limitations[]`.

Per active restaurant: `menuStatus`, `lastRevisionAt`, `lastRevisionDate`, `daysSinceRevision`,
`revisionsInRange`, `recommendations {exposures, selections, selectionRate, distinctUsers, suppressed}`,
`reviews {reviewCount, distinctReviewers, meanOverall, suppressed}`, `synthetic`.

## 3. Definitions and formulas

| Term | Definition |
|---|---|
| Cutoff | Exclusive instant = `min(now, start of the Bogotá day after to)`. Nothing at or after it is counted |
| Freshness window | The 7 Bogotá calendar days ending at `to`: `[to − 6, to]` |
| `FRESH` | The last recorded revision before the cutoff has a Bogotá date inside the freshness window |
| `STALE` | Revisions exist before the cutoff, but the last one is older than the window |
| `UNKNOWN` | No revision recorded before the cutoff. **Not** the same as stale: history before the first recorded revision is unknown |
| `daysSinceRevision` | `to − lastRevisionDate` in calendar days |
| `revisionsInRange` | Revisions with `changedAt ∈ [start of from, cutoff)` |
| Exposure | One distinct recommendation with a `RECOMMENDATION_IMPRESSION` in range that offered the restaurant as WALK or ORDER (`metadata.restaurant.id`). WALK and ORDER to the same restaurant in one run count **once**. COOK is never an exposure |
| Selection | An exposed recommendation with a `RECOMMENDATION_SELECTED` in range whose selected WALK/ORDER alternative is that restaurant |
| `selectionRate` | `selections ÷ exposures`; `null` when `exposures = 0` |
| Review aggregate | Reviews with `reviewDate ∈ [from, to]`; `meanOverall = Σ overall ÷ reviewCount` |
| Suppression | A cell with 1–4 distinct users (exposed users, or reviewers) publishes only `suppressed: true`; 0 users is a real zero |
| Cohort | FRESH / STALE / UNKNOWN pooled over **non-suppressed** cells only, so a total can never be differenced to reveal a suppressed restaurant. `restaurantsWithSuppressed…` counts what was left out |
| Association | Spearman rank correlation (average ranks for ties) of `revisionsInRange` against `selectionRate`, and against review `meanOverall`, over restaurants with a published value. `INSUFFICIENT_DATA` with fewer than 5 such restaurants or a constant variable |

All of it is observational and cross-sectional: an association does not show that updating menus causes more
selections or better reviews.

## 4. Menu revision history (`menu_revisions`)

- Append-only. Columns: restaurant, meal (`NULL` after a removal), `meal_name`, `change_type`
  (`MENU_ITEM_ADDED` | `MENU_ITEM_REMOVED` | `PRICE_CHANGED` | `AVAILABILITY_CHANGED`), `previous_value`,
  `new_value`, `changed_at`, `source` (`MAINTENANCE_SCRIPT` | `SYNTHETIC_SEED`), `note`.
- Only two writers. `MenuMaintenance` (`src/restaurants/menu-maintenance.ts`) locks the meal row, applies the
  edit and appends the revision **in one transaction**; an edit that changes nothing writes nothing. The
  seed writes `SYNTHETIC_SEED` rows that change no catalog value.
- No HTTP mutation endpoint and no new role: `USER` and `ANALYST` cannot edit the catalog. The team runs:

```bash
npm run menu:edit -- price        --restaurant "Green Bowl" --meal "Vegetarian bowl" --value 18000 --note "Price list Nov 2026"
npm run menu:edit -- availability --restaurant "Green Bowl" --meal "Vegetarian bowl" --value false
npm run menu:edit -- add          --restaurant "Green Bowl" --name "Lentil bowl" --price 17000 --category BOWLS --tags VEGAN
npm run menu:edit -- remove       --restaurant "Green Bowl" --meal "Lentil bowl"
```

- The migration does not backfill anything. `created_at` / `updated_at` of restaurants and meals are never
  relabeled as menu maintenance, so on a real database every restaurant starts as `UNKNOWN`.

## 5. Coverage and limitations

| Limitation | Consequence |
|---|---|
| History starts at the first recorded revision (`revisionHistoryStartsAt`) | Restaurants are `UNKNOWN` until someone records an edit; this is reported, never guessed |
| Revisions are recorded by the team on behalf of restaurants | A restaurant that changes its real menu without telling CampusMeal is not seen |
| Reviews are self-reported | They do not prove a purchase or a visit |
| Selections are in-app choices of a recommended alternative | Not verified visits, orders or sales |
| Exposures come only from displayed recommendations (BQ8 impressions) | Restaurant search/detail views are not exposures here |
| Minimum 5 distinct users per cell | With few real users most cells are suppressed; the report says so instead of inventing values |
| Association needs ≥ 5 restaurants with published values | The demo catalog has 5 active restaurants: one sparse or zero-exposure restaurant already yields `INSUFFICIENT_DATA` |
| Inactive restaurants | Not reported |
| Synthetic data | Excluded by default; `includeSynthetic=true` mixes it in and `includesSyntheticData` / per-restaurant `synthetic` say so |

## 6. Synthetic verification dataset (`npm run seed:bq13`)

Prerequisite: `seed:auth` and `seed:restaurants`. Anchor `D = BQ13_SEED_DATE` (default `2026-11-20`). Creates 8
inactive users `bq13-demo-00…07@campusmeal.local` (random passwords), and only synthetic rows. Re-running it is
a no-op (stable ids + `ON CONFLICT DO NOTHING`): 7 revisions, 21 reviews, 33 recommendation runs.

| Restaurant | Synthetic revisions (days before D) | Window A exposures (users / selecting) | Window A reviews (overall) | Window B |
|---|---|---|---|---|
| Green Bowl | 1, 3, 5, 10 | 8 / 6, WALK and ORDER both to Green Bowl (dedup case) | 6 reviewers: 5,4,5,4,5,4 | 3 exposed / 1 selecting; 2 reviewers |
| The Garden | 2 | 6 / 3 | 5 reviewers: 4,3,4,3,4 | — |
| Andean Flavor | 12 | 6 / 2 | 3 reviewers: 3,3,2 | — |
| Sushi Rápido | 20 | 5 / 1 | — | — |
| Quinoa Corner | — | 5 / 0 | 5 reviewers: 3,2,3,2,3 | — |

### 6.1 Expected window A: `from = D−6 = 2026-11-14`, `to = D = 2026-11-20`, `includeSynthetic=true`

| Restaurant | menuStatus | lastRevisionDate | daysSince | revisionsInRange | exposures | selections | selectionRate | reviews | meanOverall |
|---|---|---|---:|---:|---:|---:|---:|---|---:|
| Green Bowl | FRESH | 2026-11-19 | 1 | 3 | 8 | 6 | 0.75 | 6 | 4.50 |
| The Garden | FRESH | 2026-11-18 | 2 | 1 | 6 | 3 | 0.50 | 5 | 3.60 |
| Andean Flavor | STALE | 2026-11-08 | 12 | 0 | 6 | 2 | 0.3333 | suppressed (3) | — |
| Sushi Rápido | STALE | 2026-10-31 | 20 | 0 | 5 | 1 | 0.20 | 0 (zero, not suppressed) | null |
| Quinoa Corner | UNKNOWN | null | null | 0 | 5 | 0 | 0 | 5 | 2.60 |

Cohorts: FRESH 14 exposures / 9 selections = 0.6429, 11 reviews, mean 45/11 = 4.09; STALE 11 / 3 = 0.2727,
1 restaurant with suppressed reviews, 0 published reviews; UNKNOWN 5 / 0 = 0, 5 reviews, mean 2.60.

Associations:
- `revisionsInRange` vs `selectionRate`: n = 5. x = (3, 1, 0, 0, 0) → ranks (5, 4, 2, 2, 2); y = (0.75, 0.5,
  0.333, 0.2, 0) → ranks (5, 4, 3, 2, 1). ρ = 8 / √(8 × 10) = **0.8944**, `COMPUTED`.
- `revisionsInRange` vs `meanOverall`: only 3 published means (Green Bowl, The Garden, Quinoa Corner) →
  `INSUFFICIENT_DATA`.

### 6.2 Expected window B: `from = D−13 = 2026-11-07`, `to = D−7 = 2026-11-13`, `includeSynthetic=true`

| Restaurant | menuStatus | lastRevisionDate | daysSince | revisionsInRange | recommendations | reviews |
|---|---|---|---:|---:|---|---|
| Green Bowl | FRESH | 2026-11-10 | 3 | 1 | suppressed (3 users) | suppressed (2) |
| Andean Flavor | FRESH | 2026-11-08 | 5 | 1 | 0 exposures, rate null | 0 |
| Sushi Rápido | STALE | 2026-10-31 | 13 | 0 | 0 exposures | 0 |
| The Garden | UNKNOWN (its only revision is after this cutoff) | null | null | 0 | 0 exposures | 0 |
| Quinoa Corner | UNKNOWN | null | null | 0 | 0 exposures | 0 |

Both associations `INSUFFICIENT_DATA` (0 published values). FRESH cohort pools 0 exposures with 1 restaurant
left out as suppressed.

### 6.3 Expected without synthetic data (`includeSynthetic=false`, clean database)

Every restaurant `UNKNOWN`, `revisionHistoryStartsAt: null`, zero exposures, both associations
`INSUFFICIENT_DATA`, `includesSyntheticData: false`.

## 7. Validation record

Run on 2026-11-24 (America/Bogota) against a **local** PostgreSQL 18 (`docker compose`) with the API built from
this branch. Neon was not touched. `scripts/verify-s4-03.sh` (uses `node`, registers its own reviewer account).

| # | Check | Expected | Observed |
|---|---|---|---|
| — | `migration:run` → `migration:revert` → `migration:run` | Up, down and up again succeed | Succeeded |
| — | `typeorm schema:log` after migrating | No difference between entities and schema | "Your schema is up to date" |
| — | `seed:bq13` twice | Same row counts after the second run | 7 revisions, 21 reviews, 33 runs both times |
| 1 | New review | 201 | 201 |
| 2 | Same id and body | 200, same `reviewId` | 200, same `reviewId` |
| 3 | Same id, different score | 409 `CLIENT_REVIEW_ID_CONFLICT` | 409 `CLIENT_REVIEW_ID_CONFLICT` |
| 4 | New id, same restaurant and day | 409 `REVIEW_ALREADY_SUBMITTED_TODAY` | 409 `REVIEW_ALREADY_SUBMITTED_TODAY` |
| 5–8 | Score 6; `comment` field; `occurredAt` 40 days old; 1 day in the future | 400 each | 400 each |
| 9 | Unknown restaurant | 404 `RESTAURANT_NOT_FOUND` | 404 |
| 10 | Invalid token | 401 | 401 |
| 11 | 5 concurrent posts of one new review | one 201, four 200, one row | `201 200 200 200 200` |
| 12 | Public reviews, real only (1 real reviewer) | suppressed, `recent` empty | suppressed |
| 13 | Public reviews with synthetic (first run) | 9 reviews, 7 reviewers, catalog rating separate | 9 / 7, mean 4.56, `catalogRating 4.6 CATALOG_SEED` |
| 14 | `partner-health` as `USER` | 403 | 403 |
| 15–17 | `from > to`; > 92 days; `to` tomorrow | 400 each | 400 each, specific messages |
| 18 | Window A | §6.1 | Matches §6.1, ρ = 0.8944 |
| 19 | Window B | §6.2 | Matches §6.2 |
| 20 | Window A without synthetic | §6.3 | All `UNKNOWN`, `INSUFFICIENT_DATA`, `includesSyntheticData: false` |
| — | `menu:edit` price, same price again, availability ×2, add, remove, restore price | 6 revisions; repeated price writes none; removed meal keeps `meal_name`, `meal_id` NULL | As expected |
| — | `partner-health` for 2026-11-18…24 without synthetic after those edits | Green Bowl `FRESH`, `revisionsInRange 6`, others `UNKNOWN`; reviews suppressed (< 5 real reviewers) | As expected |

Pending: the same script against Render + Neon after deployment (§8), recorded by the owner.

## 8. Deployment (Render + Neon)

Additive: two new tables; existing endpoints, the Android 0.4.0 app and the Swift app are unaffected.

```bash
npm run build
node --env-file=.env.render node_modules/typeorm/cli.js -d dist/database/data-source.js migration:show
node --env-file=.env.render node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run
# Optional, only for the demo: synthetic rows, hidden unless includeSynthetic=true
node --env-file=.env.render dist/database/seeds/bq13.seed.js
```

Deploy the merged commit on Render, then run `scripts/verify-s4-03.sh` with
`API_URL=https://campusmeal-api.onrender.com/api/v1` and `REVIEW_EMAIL`/`REVIEW_PASSWORD` of a test account
(without them the script registers a new `s4-03-…@campusmeal.local` account). The first request may take
~40 s while Render wakes up; that is not app latency.

## 9. Differences from the S4-01 proposal (`SPRINT4_SCOPE.md` §5.1)

All additive or naming refinements; to be reflected in the Android scope document:

| Proposal | Implemented | Why |
|---|---|---|
| `revisionsInWindow` | `revisionsInRange` (counted over `[from, to]`) and a separate `freshnessWindow` | The report range and the 7-day freshness window are different intervals |
| Suppression "fewer than 5 users" | 0 users is a real zero; 1–4 suppressed | The acceptance criteria require distinguishing zero from suppressed |
| `GET …/reviews` returns `recent` | `recent` is empty while the summary is suppressed | Individual rows would reveal the withheld mean |
| — | `includeSynthetic` query parameter (default `false`) on both reads | Students never see demo reviews as real; analysts opt in |
| — | Error code `RESTAURANT_NOT_FOUND` for review endpoints | Stable machine-readable code for the outbox |
| Per-restaurant flat fields | `recommendations {…}` and `reviews {…}` objects, `associations[]` | Each group carries its own `suppressed` flag |
