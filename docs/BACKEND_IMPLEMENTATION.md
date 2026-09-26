# CampusMeal Backend Implementation

How the backend is built and which business question each part answers. Endpoint-level details
live in [API_CONTRACT.md](API_CONTRACT.md); per-issue evidence lives in the `ISSUE_*` documents.

## 1. Modules

| Module | Responsibility | Issue |
|---|---|---|
| `config` | Environment validation (Joi), typed configuration, Swagger document. | #1 |
| `common` | Error format and codes, validation pipe factory, safe request logging, shared DTOs/decorators. | #1 |
| `database` | TypeORM options, CLI data source, migrations, seeds. | #1 |
| `health` | `GET /health` with a real PostgreSQL check. | #1 |
| `users` | `User` and `RefreshSession` entities, `UsersService`. | #2 |
| `auth` | Register/login/refresh/logout/me, Argon2id hashing, JWT access and rotating refresh sessions, `@Auth()`, `@Roles()`, `@CurrentUser()`. | #2 |
| `inventory` | Per-user pantry items and BQ2 expiring-item prioritization. | #3 |
| `routes` | Walking-route provider port with deterministic and external adapters. | #4 |
| `restaurants` | Restaurant/meal catalog and context-aware search (BQ4). | #4, #5 |
| `analytics` | Recommendation impression/selection events and BQ8 explanation selection rate. | #7 |

Cross-cutting rules every module follows: global prefix `/api/v1`; DTO validation with
`whitelist`, `forbidNonWhitelisted` and `transform`; success DTOs returned directly at the JSON
root (no `success`/`data` wrapper); one error shape `{statusCode, code, message, timestamp, path}`;
`synchronize: false` with migrations only; logs that never contain bodies, headers or query strings.

## 2. Business questions

| Question | Endpoint | Module |
|---|---|---|
| **BQ2** — Which items in my inventory expire within the next three days, and in what order should I consume them? | `GET /api/v1/inventory/expiring?withinDays=3` | `inventory` |
| **BQ4** — Which restaurants fit my time, budget and dietary context right now? | `POST /api/v1/restaurants/search` | `restaurants` + `routes` |

## 3. Inventory (Issue #3)

### Entity

`inventory_items` (`src/inventory/entities/inventory-item.entity.ts`):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | FK → `users.id`, **ON DELETE CASCADE** |
| `name` | varchar(150) | check: not blank after trim |
| `quantity` | double precision | check: `>= 0 AND < 'Infinity'` (also excludes `NaN`) |
| `unit` | varchar(30) | check: not blank after trim |
| `expiration_date` | date | calendar date, never a timestamp |
| `active` | boolean | default `true`; `false` = soft-deleted |
| `created_at`, `updated_at` | timestamptz | defaults `now()` |

Index `IDX_inventory_items_user_active_expiration` on `(user_id, active, expiration_date)` matches
the BQ2 filter. There is deliberately **no** unique constraint on `(user_id, name)`: the same
product may be stored twice with different dates.

### Repository pattern

`InventoryRepository` (`src/inventory/inventory.repository.ts`) is the only class that touches the
TypeORM `Repository<InventoryItem>`. Controllers and services never do. Every method takes
`userId` and includes it in the SQL, so user isolation cannot be forgotten at a call site:

```text
createForUser(userId, data)                    findOwnedActiveById(userId, itemId)
findActiveByUser(userId)                       save(item)
findExpiringByUser(userId, startDate, endDate) deactivateOwnedActive(userId, itemId)
```

`deactivateOwnedActive` is a single conditional `UPDATE ... WHERE id AND user_id AND active = true`
and reports whether one row changed, so ownership and the soft delete are decided by the database.

`InventoryService` holds the business behaviour: today's calendar date, `remainingDays`, the
window, the empty-patch rule and entity → DTO mapping (in one place).

### User scoping

Every read and write is filtered by the authenticated user id, taken from the access token with
`@CurrentUser('id')`. No endpoint accepts a user id from the client. An unknown id, an inactive
item and another user's item all produce the identical `404 INVENTORY_ITEM_NOT_FOUND`, so a caller
cannot discover which UUIDs exist.

### Endpoints

| Method | Path | Success | Notes |
|---|---|---|---|
| GET | `/api/v1/inventory` | 200 | Active items, expired included. |
| GET | `/api/v1/inventory/expiring?withinDays=3` | 200 | BQ2 list in priority order. |
| POST | `/api/v1/inventory` | 201 | Creates an active item for the caller. |
| PATCH | `/api/v1/inventory/:id` | 200 | Any subset of the four fields. |
| DELETE | `/api/v1/inventory/:id` | 204 | Soft deactivation, empty body. |

### Date-only handling and the Bogotá calendar

Expiration dates are **calendar dates**, not instants. `new Date('2026-09-25')` parses as UTC
midnight, which is the previous day in Bogotá (UTC−5), so the code never does that:

- `src/inventory/inventory-date.ts` converts the current instant to `{year, month, day}` in
  `America/Bogota` with `Intl.DateTimeFormat`, parses `YYYY-MM-DD` strictly, and compares both
  through `Date.UTC`, which makes the subtraction an exact day count.
- The `date` column is read as a plain `YYYY-MM-DD` string by the postgres driver, so no
  timezone conversion happens on the way in or out.
- No date library is used.

```text
remainingDays = expiration calendar day − today's Bogotá calendar day
-1 expired yesterday · 0 expires today · 1 tomorrow · 3 in three days
```

`currentCalendarDate(instant?)` accepts an instant so the behaviour can be checked at fixed
times (for example 2026-09-25T02:00:00Z, which is still 2026-09-24 in Bogotá) without test files.
The service resolves today **once per request**, so every item in one response is measured
against the same day.

### Inclusive range and priority order

`GET /inventory/expiring` returns active items with
`today <= expiration_date <= today + withinDays` — both ends included, so `remainingDays = 0`
(expires today) and `remainingDays = withinDays` are both in the list. Expired and inactive items
are excluded. `withinDays` is an integer 0–30, default 3.

Priority: lower `remainingDays`, then earlier `expirationDate`, then name alphabetically
(case-insensitive), then item UUID. Within one request the first two criteria are the same
ordering, so SQL orders by `expiration_date, lower(name), name, id`. The result is deterministic
and clients render it as received.

### Soft deactivation

`DELETE` never removes a row: it sets `active = false` and refreshes `updated_at`. The item then
disappears from both list endpoints, a second delete returns 404, and an inactive item can no
longer be updated. There is no reactivation endpoint. Rows are removed only with their user
(FK cascade).

### Demo seed

`npm run seed:auth` then `npm run seed:inventory` (compiled: `seed:inventory:prod`). Six items for
the demo user with dates relative to today in Bogotá — Yogurt (today), Whole milk (+1), Spinach
(+3), Rice (+30), Bread (−1), Cheese (+2, inactive) — so `withinDays=3` returns Yogurt, Whole milk
and Spinach. Fixed ids make it idempotent: re-running refreshes those six rows, never duplicating
them, and touches no other user's inventory. See [BACKEND_SETUP.md §5.3](BACKEND_SETUP.md).

## 4. Relationship with the Android client

`InventoryItemResponseDto` matches Android's `InventoryItemDto` field by field:
`id, name, quantity, unit, expirationDate, remainingDays, active` — all required, so a missing
field would break decoding, and no extra fields are sent. The list wrapper `{ "items": [...] }`
matches `ExpiringInventoryResponseDto`.

The client calls `GET inventory/expiring?withinDays=3`, keeps the backend order (`priorityIndex`
in its Room cache) and does not recompute `remainingDays`. Its mapper also re-checks
`active && remainingDays in 0..withinDays` and rejects duplicate ids, which the backend already
guarantees. No Android change was needed for this backend.

## 5. Reuse by Issue #6

`InventoryModule` exports `InventoryService` (not the repository), so the Cook–Walk–Order
comparison can inject it directly:

```typescript
@Module({ imports: [InventoryModule] })

constructor(private readonly inventory: InventoryService) {}

const pantry = await this.inventory.list(userId);          // active items, remainingDays included
const soon = await this.inventory.getExpiring(userId, 3);  // BQ2 list, priority order
```

Both return the same `{ items: InventoryItemResponseDto[] }` shape the API returns, already
scoped to the user and with `remainingDays` calculated, so "cook what expires first" needs no
extra query or date logic. Persistence stays behind `InventoryRepository`; if Issue #6 needs a
different query, add a method there rather than injecting a TypeORM repository elsewhere.
