# Issue #4 – Restaurant Catalog and Walking-Route Provider Adapter

**Status:** Complete and verified locally on 2026-09-23 (macOS, Node v26.0.0, Docker 28.5.1,
PostgreSQL 18 via Docker Compose). `npm run build` and `npm run lint` pass cleanly. All 3
migrations (including issues #1 and #2) applied cleanly to an empty database; `npm run
seed:restaurants` created 5 restaurants with 9 meals and was confirmed idempotent on a second
run; the app started successfully with `ROUTE_PROVIDER_MODE=deterministic` and
`GET /api/v1/health` returned 200. `DeterministicRouteAdapter` was exercised directly against
the seeded coordinates and returned `AVAILABLE` with whole-minute, non-null estimates.

## 1. Objective

Store the restaurant/meal catalog and connect the backend to an external walking-route
service through the Adapter pattern, so BQ4 (#5) and BQ5 (#6) can depend on a stable
`RouteProviderPort` instead of a specific provider's API.

## 2. No public endpoints

This issue adds no controller. `RestaurantsModule` only registers `Restaurant`/`Meal` with
TypeORM so #5 and #6 can `@InjectRepository` them; `RoutesModule` only provides
`ROUTE_PROVIDER_PORT`. The `POST /restaurants/search` and `GET /restaurants/:id` endpoints
that expose this data belong to issue #5.

## 3. Entities

`restaurants` (`src/restaurants/entities/restaurant.entity.ts`):

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name, category, address | varchar | |
| latitude, longitude | double precision | |
| opening_hours | jsonb | `OpeningPeriod[]` — see §4 |
| average_rating | double precision | CHECK 0–5 |
| delivery_available | boolean | default false |
| estimated_delivery_minutes, delivery_fee | integer, nullable | CHECK: both set iff `delivery_available` |
| active | boolean | default true |

`meals` (`src/restaurants/entities/meal.entity.ts`): `id`, `restaurant_id` (FK, `ON DELETE
CASCADE`), `name`, `price` (integer, whole COP), `dietary_tags` (`dietary_tag[]` —
`VEGETARIAN`/`VEGAN`/`GLUTEN_FREE`, exact values from the architecture doc §9), `available`.

## 4. Opening hours representation

`OpeningPeriod = { dayOfWeek: 0-6 (JS Date#getDay, 0=Sunday), opensAt: "HH:mm", closesAt: "HH:mm" }`,
stored as a JSONB array so a restaurant can have a split lunch/dinner shift (same `dayOfWeek`
repeated). Computing `OPEN`/`CLOSING_SOON`/`CLOSED` from this schedule against a request
timestamp is issue #5's job — this issue only stores the raw schedule reliably.

## 5. RouteProviderPort (Adapter pattern)

```ts
interface RouteProviderPort {
  getWalkingTimes(origin: Coordinates, destinations: Coordinates[]): Promise<RouteMatrixResult>;
}
```

`RouteMatrixResult = { status: AVAILABLE | PARTIAL | UNAVAILABLE, estimates: RouteEstimate[] }`,
`RouteEstimate = { destination, walkingMinutes: number | null }`. Business services (BQ4, BQ5)
depend only on this interface, injected via the `ROUTE_PROVIDER_PORT` token — never on a
provider's request/response shape.

Two implementations, chosen by `ROUTE_PROVIDER_MODE` (`src/routes/routes.module.ts`):

- **`DeterministicRouteAdapter`** (default): haversine straight-line distance at an assumed
  walking speed (80 m/min ≈ 4.8 km/h). Same input → same output, no network call, no API key.
  This is what makes `npm run start:dev` work with zero external configuration.
- **`ExternalRouteAdapter`**: POSTs `{ origin, destinations, mode: 'walking' }` to
  `ROUTE_PROVIDER_URL`, with `ROUTE_PROVIDER_API_KEY` as a Bearer token and a hard timeout
  (`ROUTE_PROVIDER_TIMEOUT_MS`, via `AbortController`). A timeout, non-2xx response, or
  malformed body becomes `UNAVAILABLE` — it never throws, so a provider outage cannot crash
  the restaurant endpoint. A response with some but not all destinations resolved becomes
  `PARTIAL`. **No real provider is wired in yet** — the request/response shape here is a
  generic placeholder; whoever configures a real provider (e.g. an OSRM/ORS-style walking
  matrix) adjusts `ProviderMatrixResponse` in `external-route.adapter.ts` to match it. The
  port and the rest of the codebase do not change.
- Neither the API key nor exact user coordinates are ever logged (only `error.name` on
  failure), per architecture doc §18.

## 6. Environment variables

```env
ROUTE_PROVIDER_MODE=deterministic   # or "external"
ROUTE_PROVIDER_URL=
ROUTE_PROVIDER_API_KEY=
ROUTE_PROVIDER_TIMEOUT_MS=5000
```

Already declared (optional) in `environment.validation.ts` since issue #1; this issue adds
`RouteProviderConfiguration` to `configuration.ts` so they're readable via `ConfigService`.

## 7. Seed data

`npm run seed:restaurants` creates 5 restaurants near Universidad de los Andes (same names as
the Android/iOS UI mocks — Green Bowl, The Garden, Andean Flavor, Sushi Rápido — plus Quinoa
Corner), with different prices, dietary tags, delivery availability and opening schedules, each
with 1–2 meals. Idempotent: an existing restaurant (matched by name) is left unchanged.

## 8. Manual verification

```bash
docker compose up -d postgres
npm run migration:run
npm run seed:restaurants   # run twice to see the idempotency messages
npm run start:dev
curl http://localhost:3000/api/v1/health
```

Confirmed 2026-09-23: migrations apply cleanly to an empty database, the seed is idempotent,
and the app starts and serves `/health` with `ROUTE_PROVIDER_MODE=deterministic` and no other
route-provider variable set.
