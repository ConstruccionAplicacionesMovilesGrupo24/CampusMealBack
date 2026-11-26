# Sprint 4 / S4-06: Demand–supply gaps and context-compatible meal alternatives (BQ10)

Tracking issue: [Sprint-2-Kotlin #43](https://github.com/ConstruccionAplicacionesMovilesGrupo24/Sprint-2-Kotlin/issues/43) (S4-06).  
Owner: Natalia Espitia (@NataliaEspitia). Reviewer: Daniel Vargas (@dvargasl2).  
Backend PR: [CampusMealBack #28](https://github.com/ConstruccionAplicacionesMovilesGrupo24/CampusMealBack/pull/28).  
Android counterpart: [S4-07 / #44](https://github.com/ConstruccionAplicacionesMovilesGrupo24/Sprint-2-Kotlin/issues/44).  
Frozen scope: [SPRINT4_SCOPE.md, §5.2](https://github.com/ConstruccionAplicacionesMovilesGrupo24/Sprint-2-Kotlin/blob/main/android/docs/SPRINT4_SCOPE.md).

**Status (2026-11-25, America/Bogota):** PR #28 was merged and deployed to Render. All 12 migrations are applied on Neon; the PostgreSQL verification script passed and rolled back its temporary transaction, and the seed verified 39 synthetic search events. Local build, lint and all seven business-logic tests passed. Deployed responses confirm categorized demand, privacy suppression, unknown supply, access control and an empty alternatives result. A positive deployed `FOUND` response and additional HTTP regression checks remain outstanding. See §7 for observed results; §6 describes controlled fixtures and expected results.

## 1. Business question

**BQ10 — Type 5 (original Sprint 1 wording):**

> Which restaurant categories have high anonymized demand but low current availability in each campus zone, so CampusMeal can recommend suitable alternatives to users while providing aggregated opportunity reports to restaurant partners?

BQ10 extends the zone-demand analysis implemented for BQ9 during Sprint 3. Instead of only describing demand, it compares historical category searches with current restaurant availability. The resulting report can help analysts identify potential underserved categories. The student-facing feature provides meal substitutes that respect the user's constraints.

| Part of the question | Backend implementation |
|---|---|
| Demand by campus zone and category | Explicit categorized searches in `usage_events` |
| Current supply | Active, currently open restaurants with available meals in the catalog |
| Campus zone | `restaurants.analytics_zone` and existing `AnalyticsZone` values |
| Opportunity identification | Versioned high-demand / low-supply policy |
| Suitable alternatives | Context-compatible walking and dining recommendations |
| Privacy | Analyst authorization, aggregate-only output and minimum-user suppression |

The two endpoints serve different audiences. The analyst endpoint returns aggregate opportunities; the alternatives endpoint returns individual meal options without exposing behavioral aggregates. The latter is an explicit discovery action and does not require a detected gap or automatically trigger on one. No commercial partner portal, purchasing integration or revenue measurement is introduced by this backend change.

## 2. Data sources and schema

### 2.1 Demand

The report reuses `usage_events` rather than creating a new event type. Eligible events satisfy all of the following conditions:

- `event_type = FEATURE_USED` and `feature = RESTAURANT_SEARCH`.
- `zone_id` equals the requested coarse campus zone.
- `food_category` belongs to the existing `MealCategory` enumeration: `BOWLS`, `HOME_STYLE`, `SOUPS`, `RICE_DISHES`, `SUSHI`, `SALADS`.
- `occurred_at` falls within the inclusive requested Bogotá calendar-date interval.
- `synthetic` matches the selected dataset.

Restaurant detail visits, recommendation selections, null categories and unrecognized categories do not contribute to the denominator. These exclusions prevent unrelated interactions from being counted as explicit search intents. A user can perform multiple distinct searches; repeated transmission of the same client event is deduplicated by the existing unique `(user_id, client_event_id)` constraint.

The service uses parameterized SQL, `COUNT(*)`, `COUNT(DISTINCT user_id)` and `GROUPING SETS` to calculate category counts and the zone total. Occurrence time, rather than receipt time, assigns an event to a date window. Late synchronization may therefore change a historical report.

### 2.2 Supply and migration

Migration: [`1791000000000-AddRestaurantAnalyticsZone.ts`](../src/database/migrations/1791000000000-AddRestaurantAnalyticsZone.ts).

| Property | Definition |
|---|---|
| Table / column | `restaurants.analytics_zone` |
| PostgreSQL type | `varchar(64)`, nullable |
| TypeScript property | `analyticsZone` |
| Known zones | `bogota-centro`, `bogota-chapinero`, `bogota-teusaquillo` |
| Unknown mapping | `null`; not inferred from a user's location |

The migration explicitly backfills the five known demo restaurants using matching name and address pairs. No existing table is dropped or replaced.

| Restaurant | Assigned zone | Catalog meal categories |
|---|---|---|
| Green Bowl | `bogota-centro` | BOWLS |
| The Garden | `bogota-centro` | HOME_STYLE |
| Andean Flavor | `bogota-centro` | SOUPS, RICE_DISHES |
| Sushi Rápido | `bogota-centro` | SUSHI |
| Quinoa Corner | `bogota-centro` | SALADS |

The updated restaurant seed assigns the same zone when creating these records on a new database. Existing records are left unchanged by the seed. The migration's `down()` drops only the newly introduced column; this removes zone assignments but preserves the restaurant and meal records and the earlier Sprint 3 schema.

Supply is calculated from `restaurants` and `meals`, joined on `restaurant_id`. Only available meals are joined. The existing opening-hours evaluator uses `America/Bogota`, and both `OPEN` and `CLOSING_SOON` count as currently open. Each qualifying restaurant is counted once per category, regardless of the number of its available meals. Restaurant marketing labels (`restaurants.category`) are not used as meal categories.

## 3. Demand–supply policy (version 1)

For a zone, dataset and date interval, let:

- `N` = total number of eligible categorized search intents.
- `n(c)` = eligible search intents for category `c`.
- `u(c)` = distinct users who searched for category `c`.
- `s(c)` = distinct active and open restaurants in the zone with at least one available meal in category `c`, evaluated at `asOf`.

When demand and supply are supported and disclosure is permitted:

```text
demandShare(c) = n(c) / N
highDemand(c)  = u(c) >= 5 AND demandShare(c) >= 0.20
lowSupply(c)   = s(c) <= 1
GAP(c)         = highDemand(c) AND lowSupply(c)
```

The thresholds are inclusive. Five distinct searchers and a 20% demand share meet the high-demand threshold; one or zero available restaurants meet the low-supply threshold, provided the catalog supports that count. The thresholds are initial product-policy choices, not statistically validated market boundaries.

### 3.1 Classification and unknown values

| Status | Meaning |
|---|---|
| `GAP` | Both high demand and low supply are established. |
| `NO_GAP` | Demand is observed and supply is known, but at least one threshold is not met. |
| `NO_OBSERVATIONS` | No eligible demand was observed for the category in the requested interval. |
| `SUPPRESSED` | The demand partition cannot be disclosed under the minimum-user policy. |
| `UNKNOWN_SUPPLY` | Demand is observed, but available supply cannot be determined from the catalog. |

A zone with no mapped restaurants is treated as having unknown supply, rather than zero supply. An active, open restaurant with an available meal whose zone or category is insufficiently classified can also make supply unknown for a relevant category. Numeric fields that cannot be determined or disclosed are returned as `null`, not fabricated zeros. Every recognized category is represented in the response. Status precedence is suppression, absence of observations, unknown supply, and then threshold classification.

The report deliberately separates its historical demand interval (`from` / `to`) from its current supply snapshot (`asOf`). Changing catalog availability can change a gap classification without changing any historical search event.

### 3.2 Privacy and dataset separation

The analyst endpoint is protected by `@Auth(UserRole.ANALYST)`. It returns aggregate counts and no individual user IDs or search records. The student endpoint does not expose these aggregates.

Complementary suppression is applied to the entire demand partition when there are observed searches but fewer than five distinct searchers overall or in any observed category. In that case, the denominator, category counts, shares and demand flags are `null`; all category statuses become `SUPPRESSED`. Public-facing catalog supply metrics can still be returned if known, since they are independent of the protected demand counts.

This approach prevents reconstructing a hidden category count by subtracting visible counts from the same response. It is deliberately conservative and reduces the number of publishable results. It does not guarantee formal anonymization: overlapping date ranges and other analytics endpoints may still create differencing risks. Restricted access and coarse zones complement suppression; they do not constitute differential privacy.

`REAL` and `SYNTHETIC` select disjoint demand event datasets. Both use the same current restaurant catalog. Synthetic results must be labeled as demonstrations, not evidence of actual student demand.

## 4. API contract

Both new routes use the existing `/api/v1` prefix, authentication and Swagger conventions. Requests with invalid DTO fields are rejected by the existing global validation pipe; unknown fields are not accepted.

### 4.1 `GET /api/v1/analytics/supply-gaps` (`ANALYST` only)

Example request (synthetic fixture window):

```http
GET /api/v1/analytics/supply-gaps?zone=bogota-centro&from=2026-11-17&to=2026-11-17&dataset=SYNTHETIC
Authorization: Bearer <access-token>
```

| Query parameter | Validation / semantics |
|---|---|
| `zone` | Required; one of the three known zone values |
| `from`, `to` | Required `YYYY-MM-DD`, inclusive in Bogotá; ordered range of 1–92 days |
| `dataset` | Optional `REAL` (default) or `SYNTHETIC` |

The implemented date validator does not explicitly reject future dates; such dates must not be presented as a forecast.

**Response (HTTP 200):**

| Top-level field | Meaning |
|---|---|
| `contractVersion`, `policyVersion` | Both currently `1` |
| `generatedAt`, `asOf` | UTC instants for report generation and supply evaluation |
| `zone`, `from`, `to` | Echoed query context |
| `synthetic` | Whether the synthetic demand dataset was selected |
| `categorizedSearchIntents` | Total eligible demand, or `null` if empty or suppressed |
| `mappedRestaurants` | Distinct catalog restaurants assigned to the requested zone, including inactive or closed records |
| `demandSuppressed` | Partition-level privacy flag |
| `rows` | Category-level results |
| `limitations` | Coverage, interpretation and privacy caveats |

Illustrative row for the controlled fixture (not a captured HTTP response):

```json
{
  "category": "SUSHI",
  "searchIntents": 5,
  "distinctSearchers": 5,
  "demandShare": 0.2,
  "highDemand": true,
  "availableRestaurants": 1,
  "lowSupply": true,
  "suppressed": false,
  "status": "GAP"
}
```

`demandShare` is a fraction from 0 to 1, not a percentage. The client should multiply it by 100 for display and preserve all nullable fields. Expected authorization: authenticated `ANALYST` → 200; authenticated `USER` → 403; no valid token → 401. Invalid query parameters → 400. These HTTP outcomes remain to be verified on the deployed version.

### 4.2 `POST /api/v1/restaurants/alternatives` (authenticated users)

Example request:

```json
{
  "foodCategory": "SUSHI",
  "location": { "latitude": 4.6025, "longitude": -74.0653 },
  "campusId": "campus-001",
  "availableMinutes": 45,
  "maximumBudget": 20000,
  "dietaryPreferences": ["VEGETARIAN"],
  "includeDelivery": false,
  "requestedAt": "2026-11-25T17:00:00Z"
}
```

| Request field | Validation / semantics |
|---|---|
| `foodCategory` | Required recognized `MealCategory` to substitute |
| `location` | Required coordinates; latitude −90 to 90 and longitude −180 to 180 |
| `campusId` | Optional, nullable string (maximum 100 characters); inherited context, not used to restrict the alternative catalog by zone |
| `availableMinutes` | Integer, at least 1 |
| `maximumBudget` | Nonnegative integer in whole Colombian pesos |
| `dietaryPreferences` | Array of recognized `DietaryTag` values; all selected tags must match |
| `includeDelivery` | Required boolean inherited from the search contract; this endpoint currently supports walking only |
| `requestedAt` | Required valid ISO-8601 UTC instant ending in `Z`; current server time, not this value, determines availability |

**Response (HTTP 200):** `contractVersion`, `generatedAt`, `asOf`, `requestedCategory`, `status`, `routeProviderStatus` and `alternatives`.

Each element of `alternatives` contains:

| Field | Meaning |
|---|---|
| `restaurant` | Existing `RestaurantDto` summary, including walking and estimated total minutes |
| `meal` | Existing `MealDto`: `id`, `name`, `price`, `dietaryTags`, `mealCategory` |
| `substituteCategory` | Category of the proposed meal, different from the requested category |
| `explanation` | Human-readable reason the meal is compatible |
| `budgetCompatible`, `dietCompatible`, `timeCompatible` | All `true` for returned eligible alternatives |

`restaurant` contains `id`, `name`, `category`, `openingStatus`, `walkingMinutes`, `estimatedTotalMinutes`, `minimumMealPrice`, `dietaryTags`, `averageRating` and `recommendationReason`. For an alternative, the price and dietary summary refer to the selected meal.

| Response status | Client interpretation |
|---|---|
| `FOUND` | One or more verified-by-estimate compatible alternatives |
| `NO_COMPATIBLE_ALTERNATIVE` | No compatible result found; do not silently relax constraints |
| `REACHABILITY_UNCONFIRMED` | Otherwise eligible candidates lacked valid walking estimates and none were confirmed |

`routeProviderStatus` is `AVAILABLE`, `PARTIAL` or `UNAVAILABLE`. The status of the route provider is separate from the result status. Expected HTTP outcomes: authenticated request with valid fields → 200 (including an empty alternatives array); invalid input → 400; unauthenticated request → 401. The deployed empty-result path was observed; positive alternatives and additional HTTP error cases remain to be verified (§7).

## 5. Alternative discovery algorithm

`RestaurantsService.alternatives()` reuses the existing restaurant repository, meal repository, dietary matching helper, opening-hours evaluator and `RouteProviderPort`. It does not modify the original restaurant-search endpoint.

1. Capture the current server instant as `asOf` and load active restaurants and available meals.
2. Exclude closed restaurants, unknown meal categories and meals in the original requested category.
3. Retain only meals within budget that contain all requested dietary tags.
4. Request walking estimates for the remaining restaurant candidates in one route-provider call.
5. Reject unavailable, invalid or negative walking estimates and candidates exceeding the available time. The estimated duration is `2 × walkingMinutes + 15` minutes (round trip and a fixed dining allowance).
6. Check that the restaurant is not closed at the estimated dining completion instant.
7. Return at most 30 eligible meal alternatives, ordered by estimated total time, price, rating and deterministic name/ID tie-breakers, with the substitution explanation.

The endpoint is read-only and recomputes alternatives online. It does not write a recommendation record, create a purchase or need an outbox replay. The backend uses the supplied location for the walking-route request; this method does not persist the coordinates. An external route provider may receive those coordinates, as with the existing restaurant search.

The substitution policy currently considers other recognized meal categories equally eligible if the hard constraints are satisfied. It does not use demand counts, a learned similarity model or partner rankings to select substitutions. Dietary matching depends on catalog tags and is not a guarantee against allergens or cross-contamination. Walking and dining times are estimates, and the fixed dining allowance does not model queues. Opening checks are made at the current and estimated completion instants; continuous opening throughout the interval is not independently verified.

## 6. Synthetic data and reproducible expected results

### 6.1 Persistent demand seed

[`bq10.seed.ts`](../src/database/seeds/bq10.seed.ts) prepares five inactive demo accounts and 39 synthetic search events. Client event IDs are deterministic; re-running the seed does not duplicate those events. The seed verifies the total number of matching events before committing its transaction. No restaurant, meal, or existing real user's data is intentionally modified.

| Window (Bogotá dates) | Zone | Category | Distinct users | Intents | Expected demand share |
|---|---|---|---:|---:|---:|
| 2026-11-17 | Centro | BOWLS | 5 | 15 | 60% |
| 2026-11-17 | Centro | SUSHI | 5 | 5 | 20% |
| 2026-11-17 | Centro | SOUPS | 5 | 5 | 20% |
| 2026-11-17 | Chapinero | SUSHI | 5 | 5 | 100% |
| 2026-11-18 | Centro | SUSHI | 4 | 4 | Suppressed |
| 2026-11-18 | Centro | BOWLS | 5 | 5 | Suppressed |

These counts describe this seed alone. The actual endpoint also includes other synthetic events in the selected zone and interval, if present. The supply statuses in the persistent report depend on the catalog and its opening hours at query time. The sparse window is intended to suppress all demand values, and the Chapinero window is intended to demonstrate unknown supply if no zone mapping exists there.

### 6.2 Controlled PostgreSQL integration fixtures

[`verify-bq10-postgres.cjs`](../scripts/verify-bq10-postgres.cjs) runs the actual `SupplyGapService` SQL on one PostgreSQL connection using transaction-scoped temporary copies of the relevant table columns. It verifies the temporary search path, inserts only temporary data, and rolls back on completion. It does not create fictitious restaurants in the shared catalog. These fixtures exercise the SQL and calculation, not the HTTP authentication layer or persistent table constraints.

| Controlled scenario | Expected result |
|---|---|
| Centro: 25 categorized synthetic intents; SUSHI 5/25 with 5 users and 1 eligible restaurant | `GAP` |
| BOWLS: 15/25 with 5 users and 2 eligible restaurants | `NO_GAP` |
| SOUPS: 5/25 with 5 users and 0 eligible restaurants in a mapped catalog | `GAP` |
| SALADS: no searches | `NO_OBSERVATIONS` |
| A category with 4 distinct users in the sparse window | All demand metrics suppressed; denominator `null` |
| Chapinero: observed searches but no mapped restaurant | `UNKNOWN_SUPPLY` |
| Same synthetic window requested with dataset `REAL` (one real fixture event) | `SUPPRESSED` for insufficient users |
| Add a second open SUSHI restaurant without changing demand | SUSHI changes to `NO_GAP`; denominator remains 25 |

The script additionally checks the Bogotá date boundary, exclusion of detail events and null categories, and exclusion of closed, inactive or unavailable supply. The temporary fixtures intentionally do not enforce persistent foreign keys or uniqueness; migration and seed checks complement this test.

## 7. Verification and deployment record

### 7.1 Completed local checks (2026-11-25)

| Check | Command | Observed result |
|---|---|---|
| Backend compilation | `npm run build` | Passed |
| Source lint | `npm run lint` | Passed |
| Business-logic tests | `node --test scripts/test-bq10-policy.cjs` | 7 passed, 0 failed |
| Neon connection and migration status (before new migration) | `migration:show` with private `.env.render` | Previous 11 migrations applied; `AddRestaurantAnalyticsZone1791000000000` pending |

The seven tests cover exact demand thresholds, distinct restaurant counting, inactive/closed supply, zero versus unknown supply, complementary suppression, absent demand, alternative constraint preservation, and missing or excessive walking time. These are automated logic checks with controlled inputs and mocked dependencies; they are not a deployed end-to-end test.

### 7.2 Remote validation procedure and results

Follow [DEPLOYMENT_RENDER_NEON.md](DEPLOYMENT_RENDER_NEON.md). Run from the reviewed commit with the team coordinated, the direct Neon connection in the ignored `.env.render`, and automatic Render deployment disabled. Do not include credentials, access tokens or database connection strings in evidence.

```powershell
npm run build
npm run lint
node --test scripts/test-bq10-policy.cjs
node --env-file=.env.render node_modules/typeorm/cli.js -d dist/database/data-source.js migration:show
# After reviewing the target, pending migrations and team approval:
node --env-file=.env.render node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run
node --env-file=.env.render node_modules/typeorm/cli.js -d dist/database/data-source.js migration:show
node --env-file=.env.render scripts/verify-bq10-postgres.cjs
# With team authorization to persist synthetic events:
node --env-file=.env.render dist/database/seeds/bq10.seed.js
```

Run the seed a second time to verify the same fixture count. Stop if an unexpected migration appears, the connection target is wrong, or any validation fails. After successful checks, manually deploy the reviewed backend commit to Render and verify the following using the [published Swagger UI](https://campusmeal-api.onrender.com/api/docs).

| Check | Expected result | Observed result / status |
|---|---|---|
| Migration and schema | New migration applied; earlier schema preserved | **Passed:** 12/12 migrations marked applied; transaction committed successfully. |
| PostgreSQL integration fixtures | All assertions pass; transaction rolled back | **Passed:** SQL filters, thresholds, one/zero/two supply, suppression, unknown coverage, dataset separation and supply-change reclassification; transaction rolled back. |
| Persistent seed and repeated execution | 39 matching synthetic events, no duplicates | **Seed passed:** 39 matching events verified; a second execution was not recorded. |
| `GET /health` | 200; database up | Pending for BQ10 deployment |
| Supply-gaps as ANALYST | 200; valid contract and labeled dataset | **Successful report payloads:** [normal](evidence/sprint4/s4-06-bq10/01-centro-demand.json), [sparse](evidence/sprint4/s4-06-bq10/02-centro-suppression.json), [unknown coverage](evidence/sprint4/s4-06-bq10/03-chapinero-unknown-supply.json). |
| Supply-gaps as USER / no token | 403 / 401 | **Passed:** USER returned [403 FORBIDDEN](evidence/sprint4/s4-06-bq10/04-user-forbidden.png); earlier unauthenticated request returned 401 INVALID_ACCESS_TOKEN. |
| Invalid zone / reversed range / range >92 days | 400 | Pending |
| Synthetic normal and sparse windows | Expected demand counts or suppression, subject to other seeded events | **Passed:** 25 categorized intents in normal window; all six categories suppressed in sparse window. |
| REAL dataset for the same interval | No BQ10 synthetic seed events included | Pending |
| Alternatives as authenticated user | 200; every returned meal satisfies category, price, diet and estimated time constraints | **Empty response observed:** [NO_COMPATIBLE_ALTERNATIVE](evidence/sprint4/s4-06-bq10/05-alternatives-empty.json). Positive `FOUND` HTTP response pending; constraint filtering covered by unit tests. |
| Alternatives with insufficient time or budget | 200; no incompatible result | Pending |
| Alternatives with missing category / no token | 400 / 401 | Pending |
| Existing restaurant search, detail and BQ9 | Previously supported behavior remains available | Pending |

Record the deployed Git SHA, execution date, query inputs, HTTP status, relevant response fields and evidence links when each check is actually performed. Keep controlled fixture results separate from the shared catalog observations.

### 7.3 Deployed observations (2026-11-25, America/Bogota)

Render reported a successful live deployment of the merge of PR #28. The verified merge commit was `cd1947e7ef612d362701f9c2b9a12e2f1434a1b4`. The response timestamps below are UTC (November 26); the corresponding local date was November 25. Evidence consists of response bodies and a cropped HTTP 403 screenshot, not full request headers.

| Scenario | Query / observed UTC time | Actual result |
|---|---|---|
| Normal synthetic demand | Centro, 2026-11-17, SYNTHETIC; 01:57:57 | 25 intents, 5 mapped restaurants, no suppression. BOWLS: 15 intents (60%), 5 searchers, 0 available restaurants, GAP. SOUPS and SUSHI: 5 intents each (20%), 5 searchers each, 1 available restaurant each, GAP. Other three categories: NO_OBSERVATIONS. |
| Sparse demand | Centro, 2026-11-18, SYNTHETIC; 01:56:48 | All six categories SUPPRESSED; category demand metrics and denominator null. Catalog-only availability remains visible. |
| Unknown supply | Chapinero, 2026-11-17, SYNTHETIC; 02:00:43 | 5 SUSHI searches from 5 distinct users (100%); 0 mapped restaurants; availableRestaurants and lowSupply null; UNKNOWN_SUPPLY. |
| Role restriction | Chapinero, 2026-11-17, SYNTHETIC; 02:03:07 | HTTP 403 FORBIDDEN. |
| Alternatives | SUSHI; 02:04:08 | NO_COMPATIBLE_ALTERNATIVE; routeProviderStatus AVAILABLE; empty alternatives array. No positive deployed example captured yet. |

The observed live supply differs from the controlled PostgreSQL fixture by design: the latter includes two open BOWLS restaurants and demonstrates NO_GAP, whereas the deployed catalog had zero available BOWLS restaurants at the observed time. Neither report measures live inventory or proves the entire real-world supply. The PostgreSQL script also verified that adding a second SUSHI restaurant changes GAP to NO_GAP with the same historical demand. No permanent catalog records were added by that script.

## 8. Client integration and limitations

The Android counterpart (S4-07) will implement `AlternativeMealsScreen` and `SupplyGapReportScreen`. It should use the new endpoints, preserve `null` and status semantics, label synthetic results, display the demand interval separately from `asOf`, and avoid interpreting historical cached alternatives as currently available. The planned account-scoped Room caches, filter persistence, connectivity and concurrency strategies are client work and are not claimed as implemented in this backend PR.

Key limitations:

- Demand measures recorded search activity, not completed purchases, revenue, willingness to pay or demand among all students. The current report is observational and uses a limited catalog.
- Supply is current catalog availability, not live stock, historical supply or a reservation guarantee. A known zero is only zero within the mapped catalog. Zone mappings must be maintained as the catalog grows.
- Synthetic and real demand are separated, but share catalog supply. Other synthetic data in the same query window may affect demo aggregates.
- The alternative endpoint does not currently use `campusId` as a geographic filter, support delivery alternatives or apply gap-driven category ranking. It uses the supplied coordinates and walking estimates instead.
- Suppression is not formal anonymity. Overlapping windows, small coverage and external routing privacy require further consideration before a commercial rollout.
- Remote integration, deployed authorization and physical-device validation are still required before the issue can be considered fully accepted.

## 9. Implementation references

| Responsibility | Source |
|---|---|
| Query and response contract, statuses | [`supply-gap.dto.ts`](../src/analytics/dto/supply-gap.dto.ts) |
| Demand SQL, catalog snapshot and policy | [`supply-gap.service.ts`](../src/analytics/supply-gap.service.ts) |
| Analyst authorization and endpoint | [`analytics.controller.ts`](../src/analytics/analytics.controller.ts) |
| Restaurant mapping | [`restaurant.entity.ts`](../src/restaurants/entities/restaurant.entity.ts), [`restaurants.seed.ts`](../src/database/seeds/restaurants.seed.ts) |
| Alternatives request and response | [`alternative-meals.dto.ts`](../src/restaurants/dto/alternative-meals.dto.ts) |
| Alternatives endpoint and algorithm | [`restaurants.controller.ts`](../src/restaurants/restaurants.controller.ts), [`restaurants.service.ts`](../src/restaurants/restaurants.service.ts) |
| Opening-hours calculation | [`opening-hours.ts`](../src/restaurants/opening-hours.ts) |
| Logic tests | [`test-bq10-policy.cjs`](../scripts/test-bq10-policy.cjs) |
| Persistent synthetic demand | [`bq10.seed.ts`](../src/database/seeds/bq10.seed.ts) |
| PostgreSQL integration | [`verify-bq10-postgres.cjs`](../scripts/verify-bq10-postgres.cjs) |

Implementation reviewed against backend PR #28 at commit [`77006b30`](https://github.com/ConstruccionAplicacionesMovilesGrupo24/CampusMealBack/commit/77006b30d0f7e943872a051cfb004e3b4f9049b7). This identifies the code described above, not a verified deployed revision.
