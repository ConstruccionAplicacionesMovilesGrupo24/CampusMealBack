# Deploying CampusMealBack to Render Free + Neon Free

Status: **prepared locally, not deployed.** No Render service or Neon project exists yet. Every
URL, host name and credential below is a placeholder until the team creates the services.

> Update 2026-10-27: the team deployed the service at `https://campusmeal-api.onrender.com`.
> HTTP smoke results: [DEPLOYMENT_VALIDATION_RENDER_NEON.md](DEPLOYMENT_VALIDATION_RENDER_NEON.md).

This guide is the first-deployment runbook for the academic MVP. It keeps the current stack
(NestJS 11, TypeORM 0.3, PostgreSQL through `pg`, JWT auth) and the current API contract.

## A. Scope, architecture and responsibilities

```text
Android / iOS app ──HTTPS──▶ Render Free Web Service ──TLS (pg)──▶ Neon Free PostgreSQL
  (public API URL only)        node dist/main, /api/v1           schema from TypeORM migrations
```

- **Render Free Web Service** runs the existing Node.js server (`npm run start:prod`). It serves
  the REST API under `/api/v1`, Swagger at `/api/docs`, and signs/validates JWTs.
- **Neon Free** hosts PostgreSQL. Only the backend connects to it. The mobile apps never see the
  database URL or the JWT secrets; they only know the public API base URL.
- Schema changes happen only through the existing TypeORM migrations (`synchronize: false`,
  `migrationsRun: false`). The server never migrates or seeds on startup. The team runs
  migrations and optional demo seeds deliberately from a local machine (section C).

### Completed locally (deployment preparation)

| Item | Result |
|---|---|
| Inspected `package.json`, lockfile, `main.ts`, configuration/validation, data source, TypeORM options, migrations, seeds, health, Swagger, route adapters, Docker files and existing docs | Done. No `AGENTS.md` in the repository. |
| `.node-version` (new) | Pins Node **24** for Render (same major as the existing `Dockerfile`; Render's current default). |
| `.env.render.example` (new) | Placeholder-only deployment template, split into runtime and seed-only sections. |
| `.gitignore` | Allows `.env.render.example`; real `.env` and `.env.render` stay ignored. |
| `src/database/data-source.ts` | With `NODE_ENV=production`, the CLI/seed data source no longer merges the development `.env`, so a missing deployment value cannot silently fall back to a local database URL or demo password. Development behavior is unchanged. |
| This guide and a README link | Added. |
| Build, migrations, seeds and smoke test against a throwaway local PostgreSQL | Passed (section G.3). |

### Pending team actions

Create the Neon project, keep real secrets private, run migrations/seeds against Neon, review and
commit/push these changes, authorize Render on the GitHub organization, create and deploy the
Render service, then verify the published API and the Android app on a physical device.

## B. Create Neon (team action)

1. Sign in at <https://console.neon.tech> and create a project on the **Free** plan.
   - Postgres version: the default offered (the migrations use standard PostgreSQL features and
     `gen_random_uuid()`, available since PostgreSQL 13).
   - Region: pick the AWS region closest to the Render region you will use. Recommended pair for
     Bogotá users: **Neon AWS US East (N. Virginia, `us-east-1`)** + **Render Virginia (US East)**.
   - Database name: the default `neondb` is fine.
2. Open **Connect**, select the branch/database/role, and turn **Connection pooling off** to get
   the **direct** connection string. The host looks like `ep-<name>-<id>.<region>.aws.neon.tech`
   and must **not** contain `-pooler`.
3. Copy the string privately into `.env.render` (section C.2), never into chat, tickets, docs or
   screenshots. Neon's string ends with `?sslmode=require&channel_binding=require`. Change it to
   `?sslmode=verify-full`:
   - `pg` 8.x already treats `require` as "verify the certificate" but prints a
     `SECURITY WARNING` deprecation notice; `verify-full` states the same behavior explicitly and
     stays strict when `pg` 9 changes the meaning of `require`.
   - `channel_binding` is ignored by node-postgres unless the client enables it in code, so the
     parameter adds nothing here. TLS with certificate verification is what protects the link.

**A new Neon database is empty.** Migrations create the tables; seeds only add demonstration
data. Data in your local Docker PostgreSQL is **not** copied. Transferring it would be a separate,
intentional task (e.g. `pg_dump`/`pg_restore`) and is out of scope here.

### Direct vs pooled connection

For this single-instance MVP use the **direct** string for both the Render runtime and the
migrations. It is simpler, and one Render instance with TypeORM's default pool (up to 10
connections) is far below Neon's limits. If the team later switches the runtime to the pooled
(`-pooler`) string, migrations must still use the direct string, because Neon's PgBouncer runs in
transaction mode, which migration tools do not fully support. The code reads a single
`DATABASE_URL`, so the choice is made by which string you put in Render versus `.env.render`.

## C. Prepare the remote schema and demo data (team action)

Run everything from the backend root (`CampusMealBack/`) in **PowerShell**. The commands are
identical in Bash/Git Bash.

### C.1 Install and build with the locked dependencies

```powershell
node -v          # expect v24.x (any ^20.19.0 or >=22.13.0 is accepted; 20.17 is too old)
npm ci
npm run build
```

`npm run build` writes `dist/`; the commands below use only compiled files:
`dist/main.js`, `dist/database/data-source.js`, `dist/database/migrations/*.js` and
`dist/database/seeds/{auth,restaurants,inventory,usage}.seed.js`.

### C.2 Create the private deployment file

```powershell
Copy-Item .env.render.example .env.render
git check-ignore -v .env.render      # must print a .gitignore rule; if it prints nothing, stop
code .env.render                      # or notepad .env.render
```

Fill in `.env.render` (keep values unquoted, no spaces around `=`):

- `DATABASE_URL`: the direct Neon string with `sslmode=verify-full` (section B).
- `DATABASE_SSL=true`.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: run this twice and paste each output directly
  into the file. Do not print them anywhere else.

  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

  The validator rejects values shorter than 32 characters, values containing words like
  `replace`, `example`, `secret` or `password`, values with fewer than 10 distinct characters,
  and identical access/refresh values. **Keep the same two secrets for every redeploy**; changing
  them invalidates all issued tokens and forces every user to log in again.
- `DEMO_USER_PASSWORD` and `DEMO_ANALYST_PASSWORD` (only if you will run `seed:auth`): 8–128
  characters with an uppercase letter, a lowercase letter and a number, e.g.

  ```powershell
  node -e "console.log('Cm' + require('crypto').randomBytes(12).toString('base64url') + '7')"
  ```

  Share them with teammates through a private channel, not the repository.

The template's placeholders are intentionally rejected: the server and the migration/seed
commands refuse to start until real values are supplied.

**How the file reaches each command.** Node's built-in `--env-file` flag (Node ≥ 20.6) loads
`.env.render` into one process only; nothing persists in the terminal and the development `.env`
is not modified. Because `.env.render` sets `NODE_ENV=production`, the data source does **not**
read the development `.env` at all, so every variable a command needs must be in `.env.render`.
Do not use `npm run ...` scripts for remote work: they would read the development `.env`.

Check the target before touching it (prints no password):

```powershell
node --env-file=.env.render -e "const u = new URL(process.env.DATABASE_URL); console.log(process.env.NODE_ENV, u.hostname, u.pathname, u.searchParams.get('sslmode'))"
```

Expected: `production ep-...aws.neon.tech /neondb verify-full`, with no `-pooler` in the host.

### C.3 Review migration status

```powershell
node --env-file=.env.render node_modules/typeorm/cli.js -d dist/database/data-source.js migration:show
```

On a new database all seven migrations show `[ ]` (pending): `CreateAppMetadata`,
`CreateUsersAndRefreshSessions`, `CreateRestaurantsAndMeals`, `CreateInventoryItems`,
`CreateRecommendations`, `CreateAnalyticsEvents`, `CreateUsageEvents`.

### C.4 Apply the migrations

```powershell
node --env-file=.env.render node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run
node --env-file=.env.render node_modules/typeorm/cli.js -d dist/database/data-source.js migration:show
```

Each migration reports `has been executed successfully`, then all show `[X]`. Applied
migrations are recorded in the `typeorm_migrations` table; a second `migration:run` prints
`No migrations are pending`.

**Later releases:** whenever a reviewed release adds a migration, repeat C.1, C.3 and C.4 from
that commit **before** deploying it on Render. The server never runs migrations by itself.

### C.5 Optional demo seeds (in this order)

```powershell
node --env-file=.env.render dist/database/seeds/auth.seed.js
node --env-file=.env.render dist/database/seeds/restaurants.seed.js
node --env-file=.env.render dist/database/seeds/inventory.seed.js
node --env-file=.env.render dist/database/seeds/usage.seed.js
```

| Seed | Writes | Behavior on re-run | Needs |
|---|---|---|---|
| `auth` | `users`: one `USER` and one `ANALYST` account (argon2 password hashes) | Insert only. An existing email is reported and left untouched, **password and role included**; re-running never changes credentials. | `DEMO_USER_PASSWORD`, `DEMO_ANALYST_PASSWORD` (names/emails default to `CampusMeal Demo`/`demo@campusmeal.local` and `CampusMeal Analyst`/`analyst@campusmeal.local`). Validates them before connecting. |
| `restaurants` | `restaurants`, `meals`: 5 demo restaurants near Uniandes with 9 meals | Insert only, keyed by restaurant name. An existing restaurant (and its meals) is left unchanged. | No variables. |
| `inventory` | `inventory_items`: 6 items for the demo `USER` | **Upsert** by 6 fixed ids: every run rewrites those rows and shifts their expiration dates relative to today in Bogotá. Other rows are not touched. | Run `auth` first (fails otherwise); reads `DEMO_USER_EMAIL`. |
| `usage` | `users`: 10 **inactive** accounts `usage-demo-00..09@campusmeal.local` with random unknown passwords (cannot log in); `usage_events`: 62 events marked `synthetic = true` | Accounts are created only if missing; events use deterministic ids with `ON CONFLICT DO NOTHING`, so re-runs add no duplicates (its "(N new)" message count is not reliable on re-runs). | Optional `USAGE_SEED_MONTH=YYYY-MM`; defaults to the previous month in Bogotá. The BQ6 report for that month then reports `includesSyntheticData: true`. |

`DEMO_*` and `USAGE_SEED_MONTH` are seed-only. Do not add them to Render.

When finished, keep `.env.render` only on your machine (or delete it); never commit, upload or
attach it.

## D. Configure Render (team action)

Prerequisite: the changes in this preparation step are reviewed, committed and pushed to the
branch the team chooses (e.g. `main`), and migrations were applied to Neon (section C).

1. In the Render Dashboard choose **New → Web Service** and connect GitHub. Render asks you to
   install/authorize its GitHub app for the `ConstruccionAplicacionesMovilesGrupo24`
   organization; an organization owner may need to approve access to `CampusMealBack`. The
   repository does **not** need to be public.
2. Fill in the form:

| Field | Value |
|---|---|
| Source repository | `ConstruccionAplicacionesMovilesGrupo24/CampusMealBack` |
| Branch | the branch the team publishes (e.g. `main`) |
| Language / Runtime | **Node** (not Docker; the `Dockerfile` stays for local use) |
| Region | same area as Neon, e.g. **Virginia (US East)** |
| Root Directory | empty (the repository root holds `package.json`) |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm run start:prod` |
| Instance Type | **Free** |
| Health Check Path (Advanced) | `/api/v1/health` |
| Auto-Deploy (Advanced) | **Off** (deploy manually so code and migrations stay in step) |

3. **Node version:** no field to fill. Render reads `.node-version` (`24`) from the repository
   root; it has precedence over `engines` in `package.json`, whose open range `>=22.13.0` would
   otherwise resolve to the newest Node release. Do not add `NODE_VERSION` unless you mean to
   override the file. Confirm the version in the first build log.
4. **Environment variables** (Environment tab), copied from the RUNTIME section of your private
   `.env.render`:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | direct Neon URL with `sslmode=verify-full` (mark as secret) |
| `DATABASE_SSL` | `true` |
| `APP_TIMEZONE` | `America/Bogota` |
| `JWT_ACCESS_SECRET` | the same generated value as in `.env.render` |
| `JWT_REFRESH_SECRET` | the same generated value as in `.env.render` |
| `JWT_ACCESS_TTL` | `15m` |
| `JWT_REFRESH_TTL` | `7d` |
| `ROUTE_PROVIDER_MODE` | `valhalla` |
| `ROUTE_PROVIDER_TIMEOUT_MS` | `5000` |

   - Do **not** add `PORT`: Render injects it and the server already listens on it (all
     interfaces).
   - `ROUTE_PROVIDER_URL` can be omitted: `valhalla` defaults to the public FOSSGIS instance
     (`https://valhalla1.openstreetmap.de/sources_to_targets`, no API key, fair use, no SLA).
     `ROUTE_PROVIDER_API_KEY` is only read by `ROUTE_PROVIDER_MODE=external`; there is no key to
     configure for Valhalla.
   - Do not add `DEMO_*`, `USAGE_SEED_MONTH` or `POSTGRES_PORT`.
   - `NODE_ENV=production` is also visible during the build; that is why the build command uses
     `--include=dev` (the Nest CLI and TypeScript are devDependencies).
5. Create the service, then **Manual Deploy → Deploy latest commit**. A successful log shows
   `CampusMeal API listening on port 10000 (/api/v1, docs at /api/docs)` (Render's port may
   differ) and the health check turns green.

Render assigns the public URL, e.g. `https://campusmeal-api-example.onrender.com` (fictitious
placeholder). No custom domain is needed. This workflow does not use pre-deploy commands, Render
Shell or one-off jobs: database preparation always happens from a team machine (section C).

**Later releases:** push the reviewed commit, apply any new migrations (C.1, C.3, C.4) from that
commit, then use **Manual Deploy**.

## E. Verify the published backend (pending team checks)

Use the real Render URL in place of `https://campusmeal-api-example.onrender.com`. The first
request after inactivity can take about a minute (section G.1). Use Swagger's **Authorize**
button with a test account; do not paste tokens into chats, screenshots or reports.

| Check | How | Expected |
|---|---|---|
| Health + database | `curl.exe https://campusmeal-api-example.onrender.com/api/v1/health` | `200` with `"status":"ok","database":"up"`. `503 SERVICE_UNAVAILABLE` means the API is up but Neon is unreachable. |
| Swagger | open `/api/docs` in a browser | Swagger UI lists Auth, Health, Inventory, Restaurants, Meal decisions, Analytics. |
| Auth flow | Swagger: `POST /api/v1/auth/register` (new test email), `POST /auth/login`, Authorize, `GET /auth/me` | `201`, `200`, `200` with the user's profile and `role: USER`. Record only status codes. |
| Invalid credential | `GET /api/v1/auth/me` with `Authorization: Bearer invalid` | `401` with `code: INVALID_ACCESS_TOKEN`. A wrong password on login returns `401 INVALID_CREDENTIALS`. |
| Inventory (BQ2) | `POST /inventory`, `GET /inventory`, `GET /inventory/expiring?withinDays=3` | `201`, `200`, `200`; expiring items in consumption order. |
| Restaurants (BQ4) | `POST /restaurants/search` with a Uniandes location, then `GET /restaurants/{id}` | `200`; with seeded data, results appear. `routeProviderStatus` shows whether Valhalla answered (`AVAILABLE`/`PARTIAL`) or not (`UNAVAILABLE`, still `200`). This is the first real check of the external provider from Render. |
| Meal decisions (BQ5) | `POST /meal-decisions/compare` | `200` with Cook / Walk / Order ranking. |
| Analytics (BQ8/BQ6) | `POST /analytics/events`, `POST /analytics/usage-events` as USER; `GET /analytics/explanation-selection`, `GET /analytics/feature-adoption?month=YYYY-MM` as ANALYST | `202` for ingestion; `200` for reports as ANALYST, `403 FORBIDDEN` as USER. |
| Persistence | After creating data, use **Manual Deploy** or **Restart service**, then log in and `GET /inventory` | Same user and items are still there (they live in Neon, not on Render's disk). |
| Cold start | Wait more than 15 minutes, then call `/api/v1/health` and note the time | Record the real delay and whether a retry was needed. Do not report it as instant. |

## F. Android handoff (instructions only)

The Android project (`Sprint-2/android`, separate repository) reads the base URL at build time:

| Build | Gradle property (`local.properties` or `~/.gradle/gradle.properties`) | Environment variable |
|---|---|---|
| debug | `campusmeal.apiBaseUrl` | `CAMPUSMEAL_API_BASE_URL` |
| release | `campusmeal.releaseApiBaseUrl` | `CAMPUSMEAL_RELEASE_API_BASE_URL` |

Set the value to the public Render URL ending in `/api/v1/`, e.g.
`https://campusmeal-api-example.onrender.com/api/v1/` (the trailing `/` is required; release
builds require `https://`). Keep it in private local build settings, rebuild and install the APK,
then verify login, inventory, restaurant search and meal comparison on a physical device **over
mobile data** (not the campus Wi-Fi).

Only the public API URL belongs in the app. `DATABASE_URL`, database passwords and the JWT
signing secrets never go into the APK, Gradle files or the Android repository. No CORS change is
needed: native apps are not subject to browser CORS rules.

## G. Limits, troubleshooting and validation record

### G.1 Free-plan behavior (checked against official docs on 2026-10-27; confirm before relying on numbers)

- **Render Free web service** ([docs](https://render.com/docs/free)): spins down after 15
  minutes without inbound traffic; the next request wakes it in about one minute. 750 free
  instance hours per workspace per month; when exhausted, free services are suspended until the
  next month. Single instance only; no persistent disk, Render Shell or one-off jobs. The local
  filesystem is ephemeral (lost on redeploy, restart or spin-down), which is fine: all data lives
  in Neon. No keep-alive pings or scheduled traffic are used to avoid spin-down.
- **Neon Free** ([plans](https://neon.com/docs/introduction/plans)): compute scales to zero after
  5 minutes of inactivity (cannot be disabled on Free); the first query after that waits for the
  compute to resume. Quotas: 100 CU-hours of compute and 1 GB of storage per project per month
  (as listed today). Exceeding quotas can suspend the database. No availability is guaranteed.
- **Why Neon instead of Render Postgres:** Render's Free Postgres expires 30 days after creation
  (then deleted after a 14-day grace period). Neon Free has no such expiry.
- **Wake-up latency in this code:** the pool waits up to 5 s for a connection
  (`connectionTimeoutMillis: 5000`), and at startup TypeORM retries 5 times, 3 s apart. A cold
  Render instance plus a suspended Neon compute can make the first request slow, or the first
  health check return `503` once. Retry once and record it. These settings were not changed.

### G.2 Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Render build fails in `nest: not found` | Build command missing `--include=dev`. Use exactly `npm ci --include=dev && npm run build`. |
| `Cannot find module '/opt/render/project/src/dist/main'` | Build did not run or failed; check the build log. Start command must be `npm run start:prod`. |
| Deploy "timed out" / no open port | The app crashed before listening (see the next rows). Do not set `PORT` manually. |
| `Invalid environment configuration: - "X" is required` | Variable missing in Render (or in `.env.render` for local commands; the development `.env` is ignored when `NODE_ENV=production`). |
| `"JWT_ACCESS_SECRET" looks like a placeholder or weak value` | A template value or weak string was used. Generate as in C.2. |
| `"JWT_REFRESH_SECRET" must be a random value different from JWT_ACCESS_SECRET` | Use two different generated values. |
| All users suddenly get `401` after a redeploy | JWT secrets were changed. Restore the previous values (keep them stable). |
| `Unable to connect to the database. Retrying (1)...` then exit | Wrong host/password, Neon project suspended or quota exceeded, or a firewall. Check the Neon console. |
| `self-signed certificate` / `unable to verify the first certificate` | The URL does not point to Neon's TLS endpoint (e.g. a proxy). Use Neon's host. Do **not** disable verification (`rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, `sslmode=no-verify`). |
| `SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'` | Harmless; change `sslmode=require` to `sslmode=verify-full`. |
| `The server does not support SSL connections` | `DATABASE_SSL=true` or `sslmode` used against a server without TLS (e.g. local Docker). For Neon keep both. |
| Migration errors mentioning prepared statements, advisory locks or `SET` | You used the pooled (`-pooler`) host. Use the direct string for migrations. |
| `relation "users" does not exist` (500 on login) or `migration:show` lists `[ ]` | Migrations not applied to this database. Run C.3–C.4 with the same `DATABASE_URL` as Render. |
| `Cannot find module '.../dist/database/data-source.js'` or a seed file | Run `npm run build` first; run commands from the backend root. |
| `node.exe: .env.render: not found` | Run from the backend root, or create the file (C.2). |
| `Demo user demo@campusmeal.local does not exist. Run npm run seed:auth first.` | Run the `auth` seed before `inventory`, with the same `DEMO_USER_EMAIL`. |
| Demo login fails although `seed:auth` says `already exists, left unchanged` | The account was created earlier with another password; the seed never changes passwords. Use the original password or register another account. |
| `routeProviderStatus: UNAVAILABLE` / walking times `null` | Valhalla timed out, returned an error or rate-limited. The API still answers `200` (existing behavior). Retry later; do not switch to `deterministic` in production without telling users that times are estimates. |
| Health `503 SERVICE_UNAVAILABLE` | API up, database unreachable (often a resuming Neon compute). Retry; then check Neon. |

**Sharing logs safely:** the request log prints only method, path (no query string), status and
duration; headers, bodies and tokens are never logged, and validation errors never echo values.
Before sharing anything, still remove: `Authorization` headers and tokens, the `DATABASE_URL`
(or at least its password), JWT secrets and demo passwords. Copy Render log lines rather than
screenshots of the Environment tab. Example of a safe excerpt:

```text
[Nest] ... ERROR [TypeOrmModule] Unable to connect to the database. Retrying (1)...
error: password authentication failed for user "<redacted>"
```

### G.3 Validation record

Checks executed locally on 2026-10-27 (Windows host + Docker). The disposable database was a
throwaway `postgres:18-alpine` container (`campusmeal-deploy-check-db`, no named volume, removed
afterwards); the user's development database and `campusmeal_postgres_data` volume were not
touched. Dummy secrets were generated inside the container and never printed or saved.

| Check | Command / steps | Actual result | Status |
|---|---|---|---|
| Lint | `npm run lint` (host, Node 20.17 with existing `node_modules`) | exit 0 | Passed |
| Format | `npm run format:check` | 11 files fail; all 11 also fail at `HEAD` (pre-existing, not auto-fixed). The changed `data-source.ts` passes. | Pre-existing failure |
| Host build | `npm run build` | exit 0; `dist/main.js`, `dist/database/data-source.js`, 7 migrations, 4 seeds emitted | Passed |
| Render-equivalent build | clean copy of the tracked tree in `node:24-bookworm-slim` (Node 24.22.1): `NODE_ENV=production npm ci --include=dev && npm run build` | exit 0, no `EBADENGINE`; same files emitted | Passed |
| Placeholder rejection | `node --env-file=.env.render.example dist/main.js` | refuses to start: both JWT secrets "look like a placeholder" | Passed (expected failure) |
| Production CLI ignores development `.env` | decoy `.env` pointing at an unreachable host present during every command | all commands used `.env.render` only | Passed |
| Migration status/run | `node --env-file=.env.render node_modules/typeorm/cli.js -d dist/database/data-source.js migration:show` / `migration:run` | 7 pending → 7 executed → all `[X]`; re-run: `No migrations are pending` | Passed |
| Seeds (twice each) | `auth`, `restaurants`, `inventory`, `usage` via `node --env-file=.env.render dist/database/seeds/*.seed.js` | first run created data; second run: auth/restaurants unchanged, inventory refreshed, usage still 62 events (no duplicates) | Passed |
| Production start | `npm run start:prod` with only runtime variables, `PORT=10000` | listening on port 10000; reachable on the container's network IP (not only localhost) | Passed |
| Smoke | health, `/api/docs`, register/login/me, invalid token, inventory create/list, restaurant search/detail, meal compare, analytics as USER | `200 ok/up`, `200`, `201/200/200`, `401 INVALID_ACCESS_TOKEN`, `201/200`, `200/200`, `200`, `403 FORBIDDEN` | Passed |
| Restart persistence | SIGTERM the node process, start again, log in and list inventory | same user and item returned | Passed |
| Secrets in logs | search API log for the generated JWT secrets | 0 matches | Passed |
| Route provider | local smoke used `ROUTE_PROVIDER_MODE=deterministic` | **local straight-line estimate only; Valhalla was not exercised** | Not validated |
| TLS to Neon | needs a real Neon endpoint | — | Pending (team) |

Pending cloud and device checks (not executed): Neon project creation; migrations and seeds on
Neon; Render service creation and first deploy; every check in section E on the public URL
(including Valhalla from Render, cold start and redeploy persistence); Android APK with the
public URL on a physical device over mobile data.

## H. S3-04 update: recipe catalog (team action)

Status: **implemented and verified locally only** (see [SPRINT3_BQ3.md §6](SPRINT3_BQ3.md#6-local-verification-record-2026-10-27)).
Until the team performs the steps below, the deployed API at `https://campusmeal-api.onrender.com`
has no `GET /api/v1/recipes`.

This release adds one additive migration (`CreateRecipeCatalog1790610000000`, table
`recipe_catalog`) and one catalog seed. The auth, restaurant, inventory and usage seeds do **not**
need to run again.

Prerequisites: Node 24; the ignored private `.env.render` from section C.2, with
`NODE_ENV=production` and the **direct** Neon `DATABASE_URL` (`sslmode=verify-full`); the same JWT
secrets as in Render (never change them for this update). Check the target first (C.2), from
the backend root, at the reviewed commit.

Order:

1. Review and publish the S3-04 code (team).
2. Apply the migration and the catalog seed to Neon from a team machine (PowerShell; identical in Bash):

   ```powershell
   npm ci
   npm run build
   node --env-file=.env.render -e "const u = new URL(process.env.DATABASE_URL); console.log(process.env.NODE_ENV, u.hostname, u.pathname, u.searchParams.get('sslmode'))"
   node --env-file=.env.render ./node_modules/typeorm/cli.js -d ./dist/database/data-source.js migration:show
   node --env-file=.env.render ./node_modules/typeorm/cli.js -d ./dist/database/data-source.js migration:run
   node --env-file=.env.render ./dist/database/seeds/recipes.seed.js
   ```

   Expected: `migration:show` lists only `[ ] CreateRecipeCatalog1790610000000` as pending;
   `migration:run` executes it; the seed prints
   `[seed:recipes] catalog 2026-10-27.1 (6 recipes, generatedAt 2026-10-27T12:00:00.000Z): created`.
   Running the seed again prints `unchanged`.
3. In Render, **Manual Deploy** of the same reviewed commit. The build and start commands do not
   change, and they never migrate or seed.
4. Verify on the public URL:
   - `GET /api/v1/health` → `200 {status: ok, database: up}`;
   - `GET /api/v1/recipes` without a token → `401 INVALID_ACCESS_TOKEN`;
   - with a USER token → `200`, `contractVersion: 1`, `catalogVersion: "2026-10-27.1"`,
     `generatedAt: "2026-10-27T12:00:00.000Z"`, 6 recipes; `?limit=1` → `400 VALIDATION_ERROR`;
   - Swagger `/api/docs` shows the Recipes tag.

   Record the results without tokens.

If Render is deployed before the seed runs, `/recipes` answers `503 SERVICE_UNAVAILABLE`. If it is
deployed before the migration, it answers `500`. Other endpoints are unaffected in both cases.
Later catalog changes need a new `catalogVersion`/`generatedAt` in
`src/recipes/demo-recipe-catalog.ts`, then a rebuild and the seed only.
