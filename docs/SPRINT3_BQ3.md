# Sprint 3 / S3-04 — Recipe catalog and BQ3 contract

> **BQ3 (Type 2):** "Given the current user's available ingredients, dietary preferences, and
> maximum preparation time, which recipes satisfy all three conditions?"

| Item | Value |
|---|---|
| Issue | S3-04, backend issue #16. Owner Juan Pablo; reviewer Natalia. **Review pending.** |
| Delivered here | `GET /api/v1/recipes`, its persistence (`recipe_catalog`), the authored demo catalog and seed, and the shared BQ3 rule with reference cases |
| Not here | The BQ3 evaluator and the Recipes screen (Android S3-05); the complete inventory screen (Android S3-03); any backend filtering or recommendation endpoint |
| Deployment | **Implemented and verified locally only.** The deployed Render/Neon API does not have this endpoint until the team applies the steps in [DEPLOYMENT_RENDER_NEON.md §H](./DEPLOYMENT_RENDER_NEON.md#h-s3-04-update-recipe-catalog-team-action). |

The backend serves the **complete** catalog. Android evaluates BQ3 on the device against the
account's complete inventory (`GET /api/v1/inventory`), so it can also answer offline from cached
data. The backend does not filter by inventory, diet, time, account or location.

## 1. `GET /api/v1/recipes`

| Item | Definition |
|---|---|
| Auth | `Authorization: Bearer <accessToken>`. Any authenticated active user: `USER` **and** `ANALYST`. No role restriction, no user id. |
| Query | None in contract version 1. **Any** parameter (e.g. `?limit=1`) → `400 VALIDATION_ERROR` (`property limit should not exist`). Authentication runs first: without a token the answer is `401`. |
| Success | `200 OK`, JSON object at the root (no `success`/`data` wrapper) |
| Size | ≤ 200 recipes; each ≤ 20 ingredients and ≤ 15 steps |
| Side effects | None. Reads write nothing, run no migration or seed, and create no analytics or usage event. |

### 1.1 Response (`200 OK`)

Real response from the local verification, reduced to one recipe (the other five follow in §3):

```json
{
  "contractVersion": 1,
  "catalogVersion": "2026-10-27.1",
  "generatedAt": "2026-10-27T12:00:00.000Z",
  "recipes": [
    {
      "id": "acc8498d-c078-42b9-980a-ab8a10e4755f",
      "name": "Spinach omelette",
      "preparationMinutes": 15,
      "servings": 1,
      "dietaryTags": ["VEGETARIAN", "GLUTEN_FREE"],
      "ingredients": [
        { "name": "Eggs", "normalizedName": "egg", "aliases": ["eggs", "huevo", "huevos"], "quantity": 2, "unit": "unit", "optional": false },
        { "name": "Spinach", "normalizedName": "spinach", "aliases": ["baby spinach", "espinaca", "espinacas"], "quantity": 50, "unit": "g", "optional": false },
        { "name": "Grated cheese", "normalizedName": "cheese", "aliases": ["grated cheese", "queso", "queso rallado"], "quantity": 30, "unit": "g", "optional": true }
      ],
      "steps": [
        "Beat the eggs.",
        "Cook the spinach in a non-stick pan for 2 minutes.",
        "Pour in the eggs, add the cheese if you have it, and cook until set."
      ]
    }
  ]
}
```

| Field | Type | Rule |
|---|---|---|
| `contractVersion` | integer | `1`. Clients reject unknown versions. |
| `catalogVersion` | string, non-empty (≤ 40) | Changes whenever any recipe or matching field changes. Part of the client cache key. |
| `generatedAt` | string, ISO-8601 UTC with milliseconds and `Z` | When **this catalog version** was produced. It is not the request time or the client sync time; Android records its own fetch time for its 24-hour cache. |
| `recipes` | array, 0–200 | The complete catalog in a fixed order. A stored empty catalog returns `[]`. |
| `recipes[].id` | UUID | Stable while the recipe exists. |
| `recipes[].name` | string, 1–150 | |
| `recipes[].preparationMinutes` | integer, 1–240 | |
| `recipes[].servings` | integer, 1–20 | Yield of the listed quantities. Version 1 has **no** serving scaling: compatibility uses the quantities as listed. |
| `recipes[].dietaryTags` | array of `VEGETARIAN`, `VEGAN`, `GLUTEN_FREE` | Assigned by the catalog author. May be `[]`. |
| `recipes[].ingredients` | array, 1–20 | At least one is required (`optional: false`). |
| `ingredients[].name` | string | Display name. |
| `ingredients[].normalizedName` | string | Lowercase, trimmed, accents removed, repeated whitespace collapsed. |
| `ingredients[].aliases` | string[] | Extra normalized names. Always emitted; may be `[]`. |
| `ingredients[].quantity` | number, finite, > 0 | For the whole yield. |
| `ingredients[].unit` | `g`, `kg`, `ml`, `L` or `unit` | Exact values. |
| `ingredients[].optional` | boolean | Optional ingredients never prevent a match and never change the recipe's dietary tags. |
| `recipes[].steps` | string[], 1–15, non-blank | |

Swagger (`/api/docs`, JSON at `/api/docs-json`) documents the same schema as
`RecipeCatalogResponseDto` → `RecipeDto` → `RecipeIngredientDto`, with the enums `RecipeUnit` and
`DietaryTag`, the bounds, the bearer auth and the error responses.

### 1.2 Errors

All errors use the common body `{ statusCode, code, message, timestamp, path }`.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Any query parameter, e.g. `property limit should not exist`. |
| 401 | `INVALID_ACCESS_TOKEN` | Missing, malformed or expired access token. |
| 401 | `USER_INACTIVE` | The account is inactive. |
| 503 | `SERVICE_UNAVAILABLE` | The table exists but **no catalog has been seeded** (`The recipe catalog is not available yet`). This is unavailable data, not an empty catalog. |
| 500 | `INTERNAL_ERROR` | Unexpected failure, e.g. the migration was not applied. The body is generic; details stay in the server log. |

There is no `403`: every role may read the catalog.

## 2. Persistence, migration and seed

- **Table `recipe_catalog`** (migration `1790610000000-CreateRecipeCatalog`, additive): one row
  with `id = 1` (CHECK), `catalog_version varchar(40)`, `generated_at timestamptz`, and
  `recipes jsonb` (CHECK: a JSON array). No user data and no foreign keys. `down` drops only this
  table.
- **Source of truth:** `src/recipes/demo-recipe-catalog.ts` (typed `RecipeCatalog`). Shared types,
  bounds and the name normalization live in `src/recipes/recipe-catalog.types.ts`.
- **Seed:** `npm run seed:recipes` (ts-node) or `npm run seed:recipes:prod` / `node dist/database/seeds/recipes.seed.js`.
  - It first validates the authored catalog: version and instant format, ≤ 200 recipes, unique
    UUIDs, name length, minutes and servings bounds, known tags, 1–20 ingredients with at least
    one required, normalized names and aliases, no matching key used twice within a recipe,
    finite quantities > 0, known units, booleans, and 1–15 non-blank steps. A problem aborts before
    connecting, with exit code 1.
  - Then, in one transaction (`SELECT … FOR UPDATE`):

    | Stored state | Result |
    |---|---|
    | No row | Insert: `created` |
    | Same `catalogVersion`, same `generatedAt`, same content (JSONB equality) | No write: `unchanged` (the stored timestamp is kept) |
    | Same `catalogVersion`, different content or instant | **Refused**, exit 1: bump `catalogVersion` and `generatedAt` |
    | Different `catalogVersion` | Atomic replace: `replaced <old version>` |

  - It writes only `recipe_catalog`. It creates no accounts, needs no demo users, and does not
    touch inventory, recommendations, analytics, usage events or MAU. The data source is always
    closed, and failures exit non-zero.
- **Startup and reads never migrate or seed** (`synchronize: false`, `migrationsRun: false`).
- **Changing the catalog later:** edit `demo-recipe-catalog.ts`, bump `catalogVersion` (for
  example `2026-11-03.1`) and `generatedAt` together, keep the existing ids for unchanged recipes,
  build, and run the seed.

These are **authored demonstration recipes** written by the team. They are not user behavior or
usage statistics.

## 3. Catalog `2026-10-27.1` (generatedAt `2026-10-27T12:00:00.000Z`, 6 recipes)

Quantities are for the stated servings. Every food used in the steps is listed; tap water is the
only thing assumed available. Dry rice (`rice`) and cooked chickpeas (`cooked chickpeas`) are
distinct identities because their quantities are not interchangeable with other forms.

| # | id | Name | Min | Serv. | Tags | Required ingredients | Optional |
|---|---|---|---:|---:|---|---|---|
| 1 | `d3dd01dc-1a0b-463b-a917-d938f02c5dbb` | Spinach rice | 20 | 1 | VEGETARIAN, VEGAN, GLUTEN_FREE | rice 150 g; spinach 50 g | — |
| 2 | `6fa3803c-e8c1-47eb-b9e1-78c9f919d445` | Milk rice | 25 | 2 | VEGETARIAN, GLUTEN_FREE | rice 100 g; whole milk 200 ml | cinnamon 1 g |
| 3 | `acc8498d-c078-42b9-980a-ab8a10e4755f` | Spinach omelette | 15 | 1 | VEGETARIAN, GLUTEN_FREE | egg 2 unit; spinach 50 g | cheese 30 g |
| 4 | `3e3b73ca-137d-416c-a14a-0b195e46bc69` | Tomato and cucumber salad | 10 | 1 | VEGETARIAN, VEGAN, GLUTEN_FREE | tomato 150 g; cucumber 100 g | lime 1 unit |
| 5 | `ec3a038a-c0b6-4455-a88c-d8ba974ec718` | Chickpea stew | 35 | 2 | VEGETARIAN, VEGAN, GLUTEN_FREE | cooked chickpeas 200 g; tomato 100 g | onion 50 g |
| 6 | `3c11947c-d305-4a56-96bd-f319642d3f84` | Chicken rice | 40 | 2 | GLUTEN_FREE | chicken 150 g; rice 100 g | — |

Matching keys (`normalizedName` first, then `aliases`):

| Ingredient (display) | Keys | Used by |
|---|---|---|
| Rice (uncooked) | `rice`, `white rice`, `arroz`, `arroz blanco` | 1, 2, 6 |
| Spinach | `spinach`, `baby spinach`, `espinaca`, `espinacas` | 1, 3 |
| Whole milk | `whole milk`, `milk`, `leche`, `leche entera` | 2 |
| Ground cinnamon | `cinnamon`, `canela` | 2 (optional) |
| Eggs | `egg`, `eggs`, `huevo`, `huevos` | 3 |
| Grated cheese | `cheese`, `grated cheese`, `queso`, `queso rallado` | 3 (optional) |
| Tomato | `tomato`, `tomatoes`, `tomate`, `tomates` | 4, 5 |
| Cucumber | `cucumber`, `cucumbers`, `pepino`, `pepinos` | 4 |
| Lime | `lime`, `limes`, `limon`, `limones` | 4 (optional) |
| Cooked chickpeas | `cooked chickpeas`, `canned chickpeas`, `garbanzos cocidos`, `garbanzos enlatados` | 5 |
| Onion | `onion`, `onions`, `cebolla`, `cebollas` | 5 (optional) |
| Chicken breast | `chicken`, `chicken breast`, `pollo`, `pechuga de pollo` | 6 |

Steps (verbatim):

1. **Spinach rice:** Rinse the rice and cook it in 300 ml of boiling water, covered, for 15 minutes. / Chop the spinach. / Stir the spinach into the hot rice and keep it covered for 2 minutes until wilted.
2. **Milk rice:** Cook the rice in 200 ml of water for 10 minutes. / Add the milk and simmer, stirring often, for 12 minutes until creamy. / Sprinkle with cinnamon if you have it.
3. **Spinach omelette:** Beat the eggs. / Cook the spinach in a non-stick pan for 2 minutes. / Pour in the eggs, add the cheese if you have it, and cook until set.
4. **Tomato and cucumber salad:** Wash and dice the tomato and the cucumber. / Mix them in a bowl. / Squeeze the lime over the salad if you have one.
5. **Chickpea stew:** If you have onion, chop it and cook it in a pot with 2 tablespoons of water for 3 minutes. / Dice the tomato, add it and cook for 5 minutes. / Add the chickpeas and 150 ml of water, then simmer for 20 minutes.
6. **Chicken rice:** Dice the chicken. / Brown the chicken in a non-stick pot over medium heat for 8 minutes, turning it. / Add the rice and 250 ml of water, cover and simmer for 20 minutes.

## 4. Shared BQ3 compatibility rule (for the Android S3-05 evaluator)

The backend does **not** compute BQ3. This is the rule the Android evaluator implements.

1. **Inputs.** The account's complete inventory (`GET /api/v1/inventory`; **not** the
   `/inventory/expiring` subset), the catalog, the selected dietary preferences, the maximum
   preparation time (Android range 5–180 minutes), and today's calendar date in `America/Bogota`.
2. **Usable items.** Only rows with `active == true`, `quantity > 0` and
   `expirationDate >= today` (today inclusive) count. Compare the stored calendar dates; BQ2's
   `remainingDays` behavior is unchanged.
3. **Names.** Normalize the inventory name: lowercase, trim, remove accents (NFD, strip combining
   marks), collapse repeated whitespace. It matches an ingredient only on **exact equality** with
   `normalizedName` or an alias. No fuzzy matching, no implicit plurals, no substitutions.
4. **Units.** Normalize the inventory unit (lowercase, trim) with this fixed table:

   | Canonical | Accepted aliases |
   |---|---|
   | `g` | `g`, `gr`, `gram`, `grams` |
   | `kg` | `kg`, `kilo`, `kilos` |
   | `ml` | `ml` |
   | `L` | `l`, `lt`, `liter`, `litre`, `liters` |
   | `unit` | `unit`, `units`, `u`, `und`, `unidad`, `unidades` |

5. **Conversion.** Only within a dimension: mass (1 kg = 1000 g), volume (1 L = 1000 ml), count
   (`unit`). Unknown units (e.g. `cups`, `loaf`) or another dimension cannot satisfy an ingredient.
   There are no densities or package sizes. *Implementation note:* compare converted totals with a
   tiny tolerance (e.g. `total + 1e-9 >= required`), so that values like `0.15 kg` are not lost to
   floating-point error. The reference cases use binary-exact values.
6. **Quantity.** Sum the converted quantities of **all** matching usable rows. Every non-optional
   ingredient needs a total ≥ its required quantity (equality passes). Recipes are evaluated
   independently: one recipe never "consumes" inventory needed by another.
7. **Diet.** The recipe's `dietaryTags` must contain **every** selected tag. No selected tags means
   no restriction.
8. **Time.** `preparationMinutes <= maximum` (equality passes).
9. **Output and order.** Only qualifying recipes, sorted by:
   1. the earliest `expirationDate` among the usable inventory rows that matched a **required**
      ingredient (rows matching only optional ingredients are ignored);
   2. then `preparationMinutes` ascending;
   3. then `name`;
   4. then `id`.
10. **States.** A complete input with no qualifying recipe is a valid **empty** answer. A missing
    catalog (never fetched, or `503`) or a missing inventory snapshot is **unavailable data**
    (`NoLocalData`), not empty. The current expiring-only Android inventory screen is not a
    complete source for this calculation (S3-03 adds the full inventory).

**Android responsibilities (S3-05, not part of this issue):** fetch and cache the catalog (24-hour
TTL keyed by `catalogVersion`; record the local fetch time); evaluate on `Dispatchers.Default`
with the rule above; show source ages and the empty/unavailable states; record
`FEATURE_USED{RECIPES}` according to the BQ6 contract. Catalog reads by themselves create no
backend events.

## 5. Reference cases

These are **authored expectations** for reuse by the Android evaluator. Common inputs:
`today = 2026-10-27` (America/Bogota), catalog `2026-10-27.1`, all rows `active: true` unless
stated, no dietary filter, and `maximum = 180` unless stated. Rows are
`name | quantity | unit | expirationDate`. Results list recipe names with their ids from §3
(SR = Spinach rice `d3dd01dc…`, MR = Milk rice `6fa3803c…`, SO = Spinach omelette `acc8498d…`,
TC = Tomato and cucumber salad `3e3b73ca…`, CS = Chickpea stew `ec3a038a…`,
CR = Chicken rice `3c11947c…`). Use the full UUIDs from §3 in automated checks.

| Case | Purpose | Inventory rows | Filters | Expected (in order) | Why the others are excluded |
|---|---|---|---|---|---|
| C01 | Positive match with the demo user's complete inventory (`GET /inventory`); rice expires beyond the 3-day window | Bread 1 loaf 2026-10-26; Yogurt 2 cups 2026-10-27; Whole milk 1 L 2026-10-28; Spinach 250 g 2026-10-30; Rice 1 kg 2026-11-26 | — | **MR, SR** (MR's earliest required item is 2026-10-28, SR's 2026-10-30) | SO no egg; TC no tomato/cucumber; CS no chickpeas/tomato; CR no chicken. Bread is expired; Yogurt matches nothing. |
| C02 | Same user, but only the `/inventory/expiring?withinDays=3` subset (wrong source) | Yogurt 2 cups 2026-10-27; Whole milk 1 L 2026-10-28; Spinach 250 g 2026-10-30 | — | **[]** | Without the rice row no rice recipe qualifies. This is why BQ3 needs the complete inventory. |
| C03 | Insufficient quantity | rice 149 g 2026-11-10; spinach 50 g 2026-11-10 | — | **[]** | SR: rice 149 g < 150 g. MR: no whole milk. CR: no chicken. |
| C04 | Exact required quantity | rice 150 g 2026-11-10; spinach 50 g 2026-11-10 | — | **SR** | MR no milk; CR no chicken; others missing ingredients. |
| C05 | Aggregation across rows | Rice 100 g 2026-11-01; Rice 50 g 2026-11-05; Spinach 50 g 2026-11-03 | — | **SR** (100 + 50 = 150 g) | MR no milk; CR no chicken. |
| C06 | `kg → g` and `L → ml` | Rice 0.25 kg 2026-11-10; Whole milk 0.5 L 2026-11-10 | — | **MR** (250 g ≥ 100 g; 500 ml ≥ 200 ml) | SR no spinach; CR no chicken. |
| C07 | Unknown and incompatible units | Rice 500 g 2026-11-10; Whole milk 2 cups 2026-11-10; Spinach 1 unit 2026-11-10 | — | **[]** | MR: `cups` is unknown, so 0 ml counts. SR and SO: spinach in `unit` is a count, not a mass. CR: no chicken. |
| C08 | Accents, case, whitespace, aliases and the `gr` unit | `  ARROZ   Blanco ` 200 g 2026-11-10; `Espinácas` 60 gr 2026-11-10 | — | **SR** (`arroz blanco` and `espinacas` are aliases) | MR no milk; CR no chicken. |
| C09 | A genuinely different name must not match | Brown rice 500 g 2026-11-10; Spinach 50 g 2026-11-10 | — | **[]** | `brown rice` is not a key of rice: no fuzzy or partial matching. |
| C10 | Expired, inactive and zero-quantity rows do not count | Rice 200 g 2026-10-26; Rice 200 g 2026-11-10 `active: false`; Rice 0 g 2026-11-10; Spinach 50 g 2026-11-10 | — | **[]** | No usable rice: expired (2026-10-26 < today), inactive, quantity 0. |
| C11 | Item expiring today counts | Rice 150 g 2026-10-27; Spinach 50 g 2026-10-27 | — | **SR** | Today is inclusive. |
| C12 | No dietary filter | Chicken 150 g 2026-11-10; Rice 100 g 2026-11-10 | — | **CR** | SR: rice 100 g < 150 g and no spinach; MR no milk. |
| C13 | Incompatible diet | same as C12 | `VEGETARIAN` | **[]** | CR lacks `VEGETARIAN`. |
| C14 | Multiple selected tags require all of them | Rice 250 g 2026-11-20; Spinach 50 g 2026-11-05; Whole milk 200 ml 2026-11-02 | `VEGAN`, `GLUTEN_FREE` | **SR** | MR lacks `VEGAN` (it has `VEGETARIAN`, `GLUTEN_FREE`). |
| C15 | Same inventory, one tag | same as C14 | `VEGETARIAN` | **MR, SR** (2026-11-02 before 2026-11-05) | CR lacks `VEGETARIAN` and has no chicken. |
| C16 | Preparation time exactly at the maximum | rice 150 g 2026-11-10; spinach 50 g 2026-11-10 | maximum 20 | **SR** (20 ≤ 20) | MR 25, CS 35, CR 40 > 20 (and missing ingredients). |
| C17 | One minute over | same as C16 | maximum 19 | **[]** | SR 20 > 19. |
| C18 | Absent optional ingredient | Huevos 2 und 2026-11-10; Spinach 50 g 2026-11-10 | — | **SO** (no cheese needed) | SR and MR no rice; others missing ingredients. |
| C19 | Valid empty inventory | (no rows) | — | **[]**, a valid empty answer, not unavailable | Every recipe misses its required ingredients. |
| C20 | Deterministic order; recipes evaluated independently | Tomato 300 g 2026-10-29; Cucumber 100 g 2026-10-29; Garbanzos cocidos 200 g 2026-11-15; Egg 2 unit 2026-11-01; Spinach 100 g 2026-10-29; Rice 150 g 2026-11-20 | — | **TC, SO, SR, CS**: all share the earliest date 2026-10-29, then 10, 15, 20, 35 minutes. TC and CS both use the 300 g of tomato (150 g and 100 g) without consuming it. | MR no milk; CR no chicken. |
| C21 | Optional-only rows do not affect the order | Egg 2 unit 2026-11-10; Spinach 100 g 2026-11-10; Rice 150 g 2026-11-08; Cheese 30 g 2026-10-28 | — | **SR, SO**: SR 2026-11-08 before SO 2026-11-10. The cheese (2026-10-28) only matches SO's optional ingredient, so it is ignored for ordering. | MR no milk; others missing ingredients. |

### What was actually executed (2026-10-27, local only)

- **HTTP observations** (disposable local PostgreSQL, compiled backend): the response shape,
  metadata, ids and contents above come from real `GET /api/v1/recipes` responses.
- **Temporary evaluator comparison:** a throwaway script (not committed, deleted afterwards)
  implemented §4 and evaluated C01–C21 against the catalog returned by the local API. **All 21
  authored expectations agreed.** This checks that the cases and the rule are consistent with each
  other; it is not the Android implementation, and the backend HTTP does not compute BQ3.

## 6. Local verification record (2026-10-27)

Disposable `postgres:18-alpine` container on `127.0.0.1:55433` (database `s304check`, anonymous
volume only, removed afterwards), driven by a temporary env file with `NODE_ENV=production` and
generated dummy secrets. The effective target was printed (host/port/database only) before every
migration and seed command. The development database, Neon and `.env.render` were not used.

| Check | Result |
|---|---|
| `npm run build` | PASS |
| `npm run lint` | PASS (0 problems) |
| Prettier on changed/new files | PASS. The global `format:check` still reports the 11 files that already fail at `HEAD`; they were not reformatted. |
| Migrations: 8 pending → all executed → `[X]` ×8 → re-run `No migrations are pending` | PASS |
| Missing catalog (migrated, not seeded) → `503 SERVICE_UNAVAILABLE` | PASS |
| Seed twice: `created`, then `unchanged`; 1 row, same version, `generated_at`, ids and JSONB md5 | PASS |
| Seed created no users, inventory, analytics or usage rows | PASS |
| Stored empty catalog → `200` with `recipes: []` | PASS |
| Same version with different stored content → seed refused (exit 1, nothing written) | PASS |
| Different stored version → `replaced 2026-10-01.1` | PASS |
| `migration:revert` drops only `recipe_catalog` (other data intact); `GET /recipes` → generic `500 INTERNAL_ERROR`; re-run + reseed restores | PASS |
| No token / invalid token → `401 INVALID_ACCESS_TOKEN` | PASS |
| USER and ANALYST → `200`, identical catalogs; repeated reads identical | PASS |
| `?limit=1`, `?catalogVersion=x`, `?limit=1&offset=2` → `400 VALIDATION_ERROR` | PASS |
| 6 recipes, unique UUIDs, exact key sets, bounds, normalized names/aliases, numeric quantities, allowed units/tags, non-blank steps, at least one optional ingredient | PASS |
| Process restart → identical catalog | PASS |
| OpenAPI: `GET /api/v1/recipes` with bearer auth; responses 200/400/401/500/503 (no 403); nested schemas with required fields, `RecipeUnit` enum, bounds | PASS |
| Regression: `GET /inventory` includes Rice (30 d) and expired Bread; `/inventory/expiring` excludes Rice; item DTO keeps 7 fields; restaurant search `200`; BQ5 compare `200`; ANALYST `auth/me` | PASS |
| Deployed Render/Neon API | NOT RUN (out of scope: no deployment) |
| Android | NOT RUN (S3-05) |
