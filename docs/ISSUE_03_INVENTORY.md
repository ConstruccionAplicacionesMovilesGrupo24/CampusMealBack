# Issue #3 – Inventory and Expiring-Item Prioritization (BQ2)

**Status:** Complete. Implemented on branch `issue-#3` (started from `d1e2fb7`, clean tree) and
validated locally on 2026-09-24 (Windows 11, Node 20.17.0, Docker 28.3.2, PostgreSQL 18 in Docker
Compose on host port 5433). Nothing was committed, staged or pushed.

## 1. Objective

Answer **BQ2**: *which items in the current user's inventory expire within the next three days,
and in what order should they be consumed?* The backend owns persistence, user isolation, the
expiration filter, the `remainingDays` calculation, the priority order, soft deletion, validation
and demo data. The Android client renders the list as received.

Design and reusable details are in [BACKEND_IMPLEMENTATION.md](BACKEND_IMPLEMENTATION.md);
request/response contracts are in [API_CONTRACT.md §9](API_CONTRACT.md).

## 2. Files

**Added**

| File | Purpose |
|---|---|
| `src/inventory/entities/inventory-item.entity.ts` | `InventoryItem` entity, checks and BQ2 index. |
| `src/inventory/inventory-date.ts` | Bogotá calendar date, strict `YYYY-MM-DD` parsing, day arithmetic. |
| `src/inventory/inventory.repository.ts` | Repository pattern; all SQL, always scoped by `userId`. |
| `src/inventory/inventory.service.ts` | Business rules, `remainingDays`, DTO mapping. |
| `src/inventory/inventory.controller.ts` | The five endpoints, `@Auth()`, Swagger. |
| `src/inventory/inventory.module.ts` | Wiring; exports `InventoryService` for Issue #6. |
| `src/inventory/inventory-errors.ts` | `INVENTORY_ITEM_NOT_FOUND`, empty-patch error. |
| `src/inventory/dto/create-inventory-item.dto.ts` | Create validation. |
| `src/inventory/dto/update-inventory-item.dto.ts` | `PartialType` of create. |
| `src/inventory/dto/expiring-inventory-query.dto.ts` | `withinDays` (0–30, default 3). |
| `src/inventory/dto/inventory-response.dto.ts` | The seven-field item DTO and its list wrapper. |
| `src/inventory/dto/is-calendar-date.validator.ts` | `@IsCalendarDate()`. |
| `src/database/migrations/1790262000000-CreateInventoryItems.ts` | Migration. |
| `src/database/seeds/inventory.seed.ts` | Demo inventory seed. |
| `docs/BACKEND_IMPLEMENTATION.md`, `docs/ISSUE_03_INVENTORY.md` | Documentation. |

**Modified**

- `src/app.module.ts` — registers `InventoryModule`.
- `src/common/enums/error-code.enum.ts` — adds `INVENTORY_ITEM_NOT_FOUND`.
- `package.json` — `seed:inventory`, `seed:inventory:prod`.
- `docs/API_CONTRACT.md` (§9 and the error table), `docs/BACKEND_SETUP.md` (§5.3, §5.4), `README.md`.
- Deleted `src/inventory/.gitkeep` (the folder now holds source files).

No existing migration was edited; no Android or Swift file was touched; no test file was added.

## 3. Migration

`1790262000000-CreateInventoryItems` runs after `1790200000000-CreateRestaurantsAndMeals`.
It creates `inventory_items`, the three checks, the composite index and the user foreign key with
explicit constraint names; `down()` drops the FK, then the index, then the table.

Verified against PostgreSQL (`\d inventory_items`):

```text
Indexes: "PK_inventory_items_id" PRIMARY KEY, btree (id)
         "IDX_inventory_items_user_active_expiration" btree (user_id, active, expiration_date)
Check constraints: CHK_inventory_items_name_not_blank      length(btrim(name)) > 0
                   CHK_inventory_items_unit_not_blank      length(btrim(unit)) > 0
                   CHK_inventory_items_quantity_non_negative
                        quantity >= 0::double precision AND quantity < 'Infinity'::double precision
Foreign key: FK_inventory_items_user_id -> users(id) ON DELETE CASCADE
```

`migration:generate` reports "No changes in database schema were found", so entity and migration
describe the same schema. `synchronize` remains `false`.

## 4. Validation rules

| Field | Rule |
|---|---|
| `name` | Trimmed, non-blank, ≤ 150 characters. |
| `quantity` | Number, finite (`allowNaN: false`, `allowInfinity: false`), ≥ 0. Fractions allowed. |
| `unit` | Trimmed, non-blank, ≤ 30 characters. |
| `expirationDate` | `@IsCalendarDate()`: exact `YYYY-MM-DD` **and** a real date. Past dates allowed. |
| `withinDays` | Optional integer 0–30, default 3; query strings are converted explicitly. |
| Unknown fields | Rejected by the existing global pipe (`forbidNonWhitelisted`). |
| Empty PATCH body | Rejected by the service with `400 VALIDATION_ERROR`. |

Database checks repeat the name/unit/quantity rules, so direct SQL cannot store invalid rows.

## 5. Validation results (executed)

| Command or check | Result |
|---|---|
| `npm install` | Passed (`EBADENGINE` warnings on Node 20.17, pre-existing) |
| `npm run build` / `npm run lint` | Passed |
| `npm run format:check` | **Fails on 4 pre-existing files**, not on Issue #3 code (see §11). Every file added or modified here is Prettier-clean. |
| `npm audit` | Passed: 0 vulnerabilities |
| `docker compose config` | Passed |
| `migration:run` (4 migrations) → `migration:show` | Passed |
| `migration:revert` | Passed: only `inventory_items` dropped; `app_metadata`, `users`, `refresh_sessions`, `restaurants`, `meals` intact |
| `migration:run` again | Passed: table, index, checks and FK recreated |
| All migrations on a fresh database | Passed (throwaway DB, dropped afterwards) |
| `migration:generate` drift check | "No changes in database schema were found" |
| Date utility, 28 fixed-instant checks | Passed (§6) |
| Inventory API suite, 84 checks | Passed (§7) |
| Regression, Swagger and seed suite, 26 checks | Passed (§8, §9) |
| Sensitive-log inspection | Passed (§10) |
| `git diff --check` | Passed |

## 6. Time-zone boundary verification

Checked with fixed instants (Bogotá is UTC−5 with no DST):

| Instant | Bogotá date | Check |
|---|---|---|
| `2026-09-25T02:00:00Z` | 2026-09-24 | expiration `2026-09-24` → `remainingDays = 0`; `2026-09-25` → 1; `2026-09-23` → −1; `2026-09-27` → 3 |
| `2026-09-25T04:59:59Z` | 2026-09-24 | last local second of the day |
| `2026-09-25T05:00:00Z` | 2026-09-25 | first local second of the next day |
| `2026-10-01T02:00:00Z` | 2026-09-30 | month end: `2026-10-01` → 1; window end +3 → `2026-10-03` |
| `2027-01-01T02:00:00Z` | 2026-12-31 | year end: `2027-01-01` → 1; window end +3 → `2027-01-03` |
| `2028-02-29T02:00:00Z` | 2028-02-28 | leap year: `2028-02-29` → 1; window end +3 → `2028-03-02` |

Parsing accepts `2028-02-29`, `2026-09-25`, `2026-12-31`; rejects `2026-02-29`, `2026-02-30`,
`2026-04-31`, `2026-13-01`, `2026-00-10`, `2026-09-00`, `25/09/2026`, `2026-9-5`,
`2026-09-25T00:00:00Z`, a trailing space and an empty string.

## 7. API validation

Run with two freshly registered users (A and B) on 2026-09-24 (Bogotá).

**Authentication** — all five endpoints answer `401 INVALID_ACCESS_TOKEN` without a token.

**Create** — 201 with exactly the seven fields; `name`/`unit` trimmed; `active` true;
`remainingDays` computed; `quantity: 0` and past dates accepted; leap day `2028-02-29` accepted and
stored as such. Rejected with `400 VALIDATION_ERROR`: negative quantity, `"NaN"`, `1e999`
(Infinity), blank name, blank unit, missing fields, `25/09/2026`, `2026-02-30`, `2026-02-29`,
`2026-9-5`, `2026-09-25T00:00:00Z`, unknown `userId`, unknown `active`, unknown `remainingDays`,
name > 150 characters, unit > 30 characters.

**BQ2** — items created at −1, 0, +1, +2 (deactivated), +3 and +4 days, plus two extra items on
day 0 to exercise the tie-break. `GET /inventory/expiring?withinDays=3` returned, in order:

```text
apple sauce(0) | Banana(0) | Today yogurt(0) | Tomorrow milk(1) | Whole milk(1) | Third-day spinach(3)
```

Excluded: the −1 expired item, the inactive +2 item, the +4 item. Every item carried the seven
required fields, `remainingDays` matched the independently computed difference, all were active,
and the order matched `remainingDays` → case-insensitive name → id (`apple sauce` before `Banana`
shows the case-insensitive rule). The root object was `{"items":[...]}` with no wrapper.

**withinDays** — omitted (= 3), `0` and `30` accepted; `-1`, `31`, `3.5`, `abc`, an empty value and
an unknown query parameter return 400. `withinDays=0` returned only `remainingDays = 0` items;
`withinDays=30` included the +4 item but never the expired or inactive ones.

**List** — includes expired active items (`Past item(-5)`), excludes inactive ones, ordered by
expiration date; empty inventory returns exactly `{"items":[]}` with 200.

**Update** — partial update kept the other fields; changing `quantity` and `expirationDate`
recalculated `remainingDays`. 400 for empty body, unknown field, blank name, negative quantity and
invalid date; 400 for a malformed UUID; 404 `INVENTORY_ITEM_NOT_FOUND` for an unknown UUID and for
an inactive item.

**Soft deactivation** — 204 with an empty body; the row remained in PostgreSQL with
`active = false` and a bumped `updated_at`; the item disappeared from both list endpoints; a second
delete and a later update both returned 404.

**User isolation** — B's list and expiring list contained only B's item and never appeared in A's.
A's attempts to update and to deactivate B's item returned `404 INVENTORY_ITEM_NOT_FOUND`, byte-for-byte
identical (except `timestamp`/`path`) to the unknown-UUID 404. B's row was unchanged in the API and
in PostgreSQL (`name`, `quantity`, `active = true`).

## 8. Swagger

`/api/docs` returns 200. All five operations appear with `security: [{"bearer":[]}]`:
`GET /api/v1/inventory`, `GET /api/v1/inventory/expiring`, `POST /api/v1/inventory`,
`PATCH /api/v1/inventory/{id}`, `DELETE /api/v1/inventory/{id}`. DELETE documents 204 with no
response body plus 401/404; PATCH documents 400 and 404; POST documents 201 and 400; the expiring
endpoint documents 200 and 400 and declares `withinDays` as optional with default 3 and range
0–30. `InventoryItemResponseDto` exposes exactly the seven Android fields, all required;
`UpdateInventoryItemDto` has none required. The spec contains no token and no demo password.

## 9. Seed

`npm run seed:auth` then `npm run seed:inventory`. First run created the six rows; the second
reported all six as `refreshed` and the row count stayed at 6 (no duplicates). Dates are relative
to today in Bogotá, and the 12 inventory rows of other users were untouched. Output contains no
password or token. With the seed applied, `withinDays=3` returned
`Yogurt(0), Whole milk(1), Spinach(3)`, while `GET /inventory` also showed `Bread(-1)` and
`Rice(30)` and hid the inactive `Cheese`.

## 10. Regression and log inspection

Health 200 (`database: up`), `/auth/me` 200, refresh rotation 200, demo login 200 and
`POST /restaurants/search` 200 (`restaurants`, `lastUpdatedAt`, `routeProviderStatus`).

The server log for the whole session contained 0 JWT-like strings, 0 `Authorization`/`Bearer`
mentions, 0 query strings, 0 cookies, and none of: item names (`Whole milk`, `Yogurt`, `Spinach`,
`B private item`), test passwords, demo password, JWT secrets or user emails. Inventory requests
log only method, path, status and duration, e.g. `LOG [HTTP] GET /api/v1/inventory 200 7ms`.

## 11. Limitations

- **No runtime check against the Android app.** Compatibility was verified against the committed
  Kotlin DTOs (field names, types, required-ness) and the JSON shape, not by running the app.
- **No pagination.** A list returns every active item; fine for a prototype pantry.
- **`quantity` is `double precision`**, so exotic fractional amounts carry normal floating-point
  imprecision. Money uses integers elsewhere; quantities are display values here.
- **No reactivation endpoint** and no hard delete, by design. Deactivated rows accumulate; a
  cleanup job is out of scope.
- **`withinDays` is capped at 30**; longer horizons would need a contract change.
- **No rate limiting** (unchanged from Issue #2, still a deployment task).
- **`npm run format:check` fails on four files that Issue #3 did not touch**:
  `src/database/migrations/1790200000000-CreateRestaurantsAndMeals.ts`,
  `src/database/seeds/restaurants.seed.ts`,
  `src/routes/infrastructure/deterministic-route.adapter.ts` and
  `src/routes/infrastructure/external-route.adapter.ts`. They were committed by Issues #4/#5
  formatted with a different Prettier version and already failed on `d1e2fb7`; the four are
  byte-identical to that commit here. Reformatting them would mean editing an existing
  migration, which Issue #3 forbids, so it is left to a separate cleanup (run
  `npm run format` on its own branch, or pin the Prettier version the team uses).
