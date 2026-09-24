# Issue #5 – Context-aware restaurant search (BQ4)

## Objective

Implement the authenticated restaurant search used by the mobile clients:

- `POST /api/v1/restaurants/search`
- `GET /api/v1/restaurants/:restaurantId`

The search combines request time, location, available minutes, maximum budget, dietary
preferences, the restaurant/meal catalog and walking estimates from `RouteProviderPort`.

## Context-awareness flow

```text
mobile context
  -> SearchRestaurantsDto validation
  -> active restaurant + available meal catalog
  -> opening-hours evaluation at requestedAt (America/Bogota)
  -> budget + dietary filtering
  -> one RouteProviderPort matrix request
  -> time-fit filtering when a route is known
  -> deterministic ordering + short explanation
```

The Android manual-campus fallback already sends the selected campus coordinates in the normal
`location` object and may additionally send `campusId`; the backend therefore applies exactly the
same search rules to current-device and manually selected campus locations. Exact coordinates are
used only for the request and are not stored or logged by this module.

## Validation

`SearchRestaurantsDto` validates:

- latitude in `[-90, 90]` and longitude in `[-180, 180]`;
- `availableMinutes >= 1`;
- `maximumBudget >= 0` in whole COP;
- dietary values from the shared `DietaryTag` enum;
- a UTC ISO-8601 `requestedAt` ending in `Z`;
- optional `campusId`.

Global whitelist validation rejects unknown request fields.

## Opening hours

Opening periods are interpreted in `America/Bogota`, including schedules that cross midnight.
The result is `OPEN`, `CLOSING_SOON` or `CLOSED`. `CLOSING_SOON` is the Sprint 2 prototype rule
for an active period with 30 minutes or less until close. Closed restaurants are excluded.

## Budget and dietary filtering

Only active restaurants and available meals are considered. A restaurant remains a candidate only
if it has at least one meal at or below `maximumBudget`. When dietary preferences are present, an
eligible meal must contain every requested tag. `minimumMealPrice` and returned dietary tags are
computed from the eligible meals.

## Walking and total time

The service makes one `RouteProviderPort.getWalkingTimes` call for the remaining restaurants.
For a known walking estimate the Sprint 2 prototype total-time rule is:

```text
estimatedTotalMinutes = 2 * walkingMinutes + 15
```

The 15-minute constant is an explicit deterministic prototype assumption because the restaurant
catalog does not store preparation/service time. Restaurants with a known total above
`availableMinutes` are excluded.

When a destination route is unavailable, `walkingMinutes` and `estimatedTotalMinutes` are `null`.
The restaurant is intentionally kept if it still satisfies opening, budget and dietary rules. This
preserves useful results during `PARTIAL` or `UNAVAILABLE` provider states.

## Ordering and recommendation reason

Results use deterministic ordering:

1. results with route estimates before results without routes;
2. lower estimated total time;
3. lower minimum eligible meal price;
4. higher average rating;
5. restaurant name, then id.

Each result includes a short deterministic reason describing the constraints it satisfies and, when
necessary, that walking time is unavailable. No machine-learning or generative model is used.

## Detail endpoint

`GET /api/v1/restaurants/:restaurantId` returns the active restaurant and its currently available
meals. The endpoint has no request origin, so it does not invent or persist a previous user's
coordinates: walking and total-time values are `null` and `routeProviderStatus` is `UNAVAILABLE`.
Opening status is evaluated at the current server instant in the restaurant time zone.

## Security and privacy

Both endpoints use `@Auth()`. `RestaurantsService` does not log request bodies or coordinates.
The route adapter receives coordinates through the internal port; provider credentials remain
backend configuration and never appear in mobile responses.

## BQ4 evidence

The implementation is context-aware because the same restaurant catalog can produce different
results when request time, origin, available minutes, budget or dietary preferences change. Route
provider degradation changes route fields/status without turning otherwise usable catalog matches
into an API failure.
