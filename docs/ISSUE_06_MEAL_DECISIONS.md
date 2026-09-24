# Issue #6 – BQ5 Cook–Walk–Order Comparison

**Status:** Complete and verified locally on 2026-09-24 (macOS, Docker, PostgreSQL 18 via Docker
Compose). `npm run build` and `npm run lint` pass cleanly. All 5 migrations applied to an
already-seeded database; `POST /api/v1/meal-decisions/compare` was called with a real JWT
(the seeded demo user) against real inventory and restaurant data and returned the expected
ranked alternatives, persisted correctly, including the zero-alternatives edge case.

## 1. Objective

Answer BQ5: among Cook, Walk and Order, which alternative gives the best combination of time
and cost while prioritizing ingredients expiring within three days. The backend owns the
entire comparison (scores, ranking, recommended alternative, explanation) — mobile clients
only display the result.

## 2. Endpoint

```http
POST /api/v1/meal-decisions/compare
Authorization: Bearer <accessToken>
```

No new query/path params. Request/response shapes match the architecture doc §13 example
exactly (`recommendationId`, `alternatives[]`, `mainExplanation`, `supportingReasons[]`).

## 3. Candidate construction (one candidate per type, never more than one restaurant per type)

- **COOK** exists only when `InventoryService.getExpiring(userId, 3)` (issue #3) returns at
  least one item — this is BQ5's whole premise ("prioritizing ingredients that expire within
  three days"), so Cook without an expiring ingredient isn't offered at all.
  `estimatedMinutes = 20` and `estimatedCost = 0` are **documented assumptions** (the issue
  gives no formula): a typical home-cooked meal using ingredients the user already owns.
- **WALK/ORDER** reuse BQ4's eligibility filter (issue #5): active, not `CLOSED`, at least one
  meal within budget and dietary preferences. Restaurant data and the route provider come
  from the same repositories/port as #4/#5 — not through `RestaurantsService`'s HTTP DTOs, to
  avoid coupling this module to another feature's response shape.
  - **WALK**: one `RouteProviderPort.getWalkingTimes()` call covers every eligible restaurant
    (matches #4's "one request, multiple restaurants" acceptance criterion).
    `estimatedMinutes = walkingMinutes * 2 + 15` (round trip + dining), identical to #5's
    `estimatedTotalMinutes` formula for consistency. The single best restaurant (lowest total
    time, then price, then rating, then name) is chosen.
  - **ORDER**: only when `includeDelivery = true`. Uses `Restaurant.deliveryAvailable` /
    `estimatedDeliveryMinutes` / `deliveryFee` directly (issue #4) — no route-provider call
    needed. `estimatedCost = minimumMealPrice + deliveryFee`; a restaurant is only eligible if
    that total still fits `maximumBudget`.
- Any candidate whose `estimatedMinutes` doesn't fit `availableMinutes` is dropped before
  scoring.

## 4. Strategy pattern

`RecommendationStrategy.calculate(input): RecommendationScore` (0-100), four implementations:

| Strategy | Signal |
|---|---|
| `TimeFitStrategy` | Rewards using less of the available time |
| `BudgetFitStrategy` | Rewards costing less relative to the budget |
| `ExpirationPriorityStrategy` | +25 points per expiring ingredient used (COOK only; WALK/ORDER always 0) |
| `ContextCompatibilityStrategy` | 100 for COOK (using your own inventory is maximally context-compatible); restaurant `averageRating / 5 * 100` for WALK/ORDER |

Overall `score` = rounded average of the four. `explanationType` = whichever strategy scored
highest (first one wins on an exact tie, since the four run in a fixed order). This value is
stored on `RecommendationRun` so issue #7 (BQ8) can group by explanation category directly.

## 5. Ranking and explanation

Sort: higher score → lower `estimatedMinutes` → lower `estimatedCost` → stable type order
`COOK, WALK, ORDER` (issue's exact tie-break rule). Rank 1 is `recommended: true`; every other
alternative is `false`. `mainExplanation` is a template keyed by the winner's
`explanationType`; `supportingReasons` lists the winner's other strategies that scored ≥ 60,
phrased individually (no generative text, per the issue's "out of scope: generative-AI
explanations").

When no candidate survives, `alternatives: []`, a generic `mainExplanation`, and
`supportingReasons: []` — the run is still persisted (with `explanationType: null`) so
`recommendationId` stays meaningful.

## 6. Persistence

`recommendation_runs` (context + explanation) and `recommendation_alternatives` (one row per
returned alternative, `metadata` jsonb holding the expiring-ingredients list or restaurant
summary). No exact user coordinates are stored (architecture doc §7). Alternatives cascade-
delete with their run.

## 7. Manual verification (2026-09-24)

```bash
docker compose up -d postgres
npm run migration:run     # 5/5 migrations, including this issue's
npm run seed:auth && npm run seed:restaurants && npm run seed:inventory
npm run start:dev
# login as demo@campusmeal.local, then:
curl -X POST http://localhost:3000/api/v1/meal-decisions/compare \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"location":{"latitude":4.6025,"longitude":-74.0653},"availableMinutes":45,"maximumBudget":20000,"dietaryPreferences":[],"includeDelivery":true,"requestedAt":"<now>"}'
```

Confirmed: COOK ranked 1 (score 83, `BUDGET_PRIORITY` explanation) using the seeded Yogurt/
Whole milk/Spinach (remainingDays 0/1/3); WALK ranked 2 with "The Garden". A second call with
`availableMinutes: 5, maximumBudget: 0` returned `alternatives: []` without error. Both runs
verified persisted correctly in PostgreSQL (`recommendation_runs` +
`recommendation_alternatives`), including the empty-alternatives case leaving no orphan rows.
