# Issue #7 – Recommendation events and explanation-selection metrics (BQ8)

**BQ8:** Which recommendation explanations obtain the highest user selection rate?

## Endpoints

| Method | Path | Access | Result |
|---|---|---|---|
| POST | `/api/v1/analytics/events` | any authenticated user | 202, empty body |
| GET | `/api/v1/analytics/explanation-selection?from&to` | `ANALYST` only | 200, BQ8 results |

Full request/response contract: `docs/API_CONTRACT.md` §10.

## Data model

Migration `1790430000000-CreateAnalyticsEvents` creates `analytics_events`:

| Column | Notes |
|---|---|
| `id` | uuid PK |
| `client_event_id` | uuid, **unique index** → idempotent retries |
| `user_id` | FK `users`, cascade delete |
| `recommendation_id` | FK `recommendation_runs`, cascade delete |
| `event_type` | enum `analytics_event_type` (`RECOMMENDATION_IMPRESSION`, `RECOMMENDATION_SELECTED`) |
| `selected_alternative` | reuses enum `meal_alternative` (#6); CHECK: required for selections, null for impressions |
| `platform` | enum `client_platform` (`ANDROID`, `IOS`) |
| `occurred_at` | device instant (UTC) |
| `received_at` | server insert time |

No coordinates, tokens, passwords or explanation category are stored. The explanation type is
read from `recommendation_runs.explanation_type` (written by #6), so clients cannot decide it.

## Ingestion rules

1. The DTO whitelist rejects any field outside the contract (e.g. `explanationType`, `latitude`).
2. `selectedAlternative` is required when `eventType = RECOMMENDATION_SELECTED`.
3. The recommendation must belong to the authenticated user; otherwise
   `404 RECOMMENDATION_NOT_FOUND` (same response for unknown and foreign ids).
4. `INSERT … ON CONFLICT DO NOTHING` on `client_event_id`: a retry returns 202 and adds no row.

## Metric formula

For each `explanationType`, over events whose `occurredAt` falls in `[from, to]`
(calendar dates in `America/Bogota`):

```text
impressions   = distinct recommendations displayed
selections    = distinct displayed recommendations with ≥ 1 selection event
selectionRate = selections / impressions   (0 when impressions = 0, rounded to 4 decimals)
```

A recommendation counts as displayed if it has an impression **or** a selection event in the
range: a selected recommendation was necessarily on screen, so a lost impression event cannot push
the rate above 1. Recommendations without an explanation type (no alternatives) are excluded.
Aggregation is a single PostgreSQL query (CTE + `COUNT … FILTER`); no background worker.
Results are sorted by `selectionRate` desc, then `impressions` desc, then type name.

## Client examples

### Swift (iOS)

```swift
struct AnalyticsEventRequest: Encodable {
    let clientEventId: UUID
    let recommendationId: String
    let eventType: String          // "RECOMMENDATION_IMPRESSION" | "RECOMMENDATION_SELECTED"
    let selectedAlternative: String?
    let platform = "IOS"
    let occurredAt: String         // ISO8601DateFormatter, UTC, "Z"
}
// POST analytics/events → 202, no body to decode
```

### Kotlin (Android)

```kotlin
data class AnalyticsEventRequest(
    val clientEventId: String = UUID.randomUUID().toString(),
    val recommendationId: String,
    val eventType: String,               // RECOMMENDATION_IMPRESSION | RECOMMENDATION_SELECTED
    val selectedAlternative: String?,    // COOK | WALK | ORDER, null for impressions
    val platform: String = "ANDROID",
    val occurredAt: String = Instant.now().toString(),
)
// @POST("analytics/events") suspend fun send(@Body e: AnalyticsEventRequest): Response<Unit>
```

Generate `clientEventId` **once per event** and reuse it on retries.

## Verification (2026-09-24, local PostgreSQL)

`scripts/verify-issue-07.sh` (API running, seeds `auth`, `restaurants`, `inventory`):

| # | Check | Result |
|---|---|---|
| 1–6 | Impressions/selection accepted | 202, empty body |
| 2 | Retry with same `clientEventId` | 202, no extra row (5 rows for 6 accepted posts) |
| 5 | Second impression of same recommendation | counted once in BQ8 |
| 7 | Selection without `selectedAlternative` | 400 `VALIDATION_ERROR` |
| 8 | Another user's recommendation | 404 `RECOMMENDATION_NOT_FOUND` |
| 9 | Unknown recommendation | 404 `RECOMMENDATION_NOT_FOUND` |
| 10–11 | Client sends `explanationType` / `latitude` | 400 (field rejected) |
| 12–13 | `occurredAt` without Z / platform `WEB` | 400 |
| 14 | No token | 401 `INVALID_ACCESS_TOKEN` |
| 16 | BQ8 as analyst | 200, rates 0–1 |
| 17 | BQ8 as regular user | 403 `FORBIDDEN` |
| 18–19 | Inverted range / malformed date | 400 `VALIDATION_ERROR` |
| 20 | Range with no events | 200, `results: []` |
| 21 | Event dated in October excluded from September | ✔ |

Extra checks: with two explanation types present, `TIME_PRIORITY` (2/2 = 1) was returned before
`BUDGET_PRIORITY` (2/6 = 0.3333); an event at `2026-10-01T03:00Z` was counted on
`2026-09-30` (Bogotá calendar day). `npm run build` and `npm run lint` pass.

Note: the demo seeds only produce `BUDGET_PRIORITY` recommendations, so real multi-type
evidence for BQ8 will come from mobile usage in Issue #8.
