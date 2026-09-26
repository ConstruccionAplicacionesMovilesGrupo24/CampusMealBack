# CampusMeal Backend – Local Setup

## 1. Required software

| Tool | Version | Notes |
|---|---|---|
| Node.js | **22 LTS or 24 LTS** recommended (`^20.19.0 \|\| >=22.13.0` accepted) | Node 20 reached end of life in April 2026. ESLint 10 requires ≥ 20.19. |
| npm | 10+ | Bundled with Node. The project uses `npm` and `package-lock.json`. |
| Docker Desktop / Docker Engine | 24+ with Compose v2 (`docker compose`) | Runs the local PostgreSQL. |
| Git | any recent | |

No global NestJS CLI is needed; every command uses the local `node_modules`.

## 2. First-time setup

```bash
git clone https://github.com/ConstruccionAplicacionesMovilesGrupo24/CampusMealBack.git
cd CampusMealBack

npm install                 # use `npm ci` for an exact, lockfile-only install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
# Edit .env: set JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (section 3.1) and the DEMO_* passwords.
docker compose up -d postgres
npm run migration:run
npm run seed:auth           # optional: demo USER and ANALYST accounts
npm run seed:restaurants    # demo restaurant catalog (BQ4/BQ5)
npm run start:dev
```

The API refuses to start until the two JWT secrets are replaced with random values.

Then open:

- Health: <http://localhost:3000/api/v1/health>
- Swagger UI: <http://localhost:3000/api/docs>
- OpenAPI JSON: <http://localhost:3000/api/docs-json>

## 3. Environment variables

`.env` is git-ignored; `.env.example` is the committed template. The app validates the
environment at startup and exits with a list of the problems if anything is wrong.

| Variable | Required | Example | Description |
|---|---|---|---|
| `NODE_ENV` | yes | `development` | `development`, `production` or `test`. |
| `PORT` | yes | `3000` | HTTP port (valid port number). |
| `DATABASE_URL` | yes | `postgresql://campusmeal:campusmeal_dev@localhost:5432/campusmeal` | Must use `postgres://` or `postgresql://`. URL-encode special characters in the password. |
| `APP_TIMEZONE` | yes | `America/Bogota` | IANA time zone for business-date logic. API timestamps are always UTC. |
| `DATABASE_SSL` | no (default `false`) | `false` | Set `true` for managed PostgreSQL providers that require TLS. |
| `POSTGRES_PORT` | no (default `5432`) | `5432` | Host port used by Docker Compose only. |
| `JWT_ACCESS_SECRET` | yes | *(random, ≥ 32 chars)* | Signs access tokens (HS256). |
| `JWT_REFRESH_SECRET` | yes | *(random, ≥ 32 chars, different)* | Signs refresh tokens; also the root of the key that hashes stored refresh tokens. |
| `JWT_ACCESS_TTL` | yes | `15m` | Access-token lifetime: `<number><s\|m\|h\|d>`. |
| `JWT_REFRESH_TTL` | yes | `7d` | Refresh-token/session lifetime. Must be longer than `JWT_ACCESS_TTL`. |
| `DEMO_USER_NAME`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` | only for `seed:auth` | see `.env.example` | Demo `USER` account. |
| `DEMO_ANALYST_NAME`, `DEMO_ANALYST_EMAIL`, `DEMO_ANALYST_PASSWORD` | only for `seed:auth` | see `.env.example` | Demo `ANALYST` account. |
| `ROUTE_PROVIDER_MODE`, `ROUTE_PROVIDER_URL`, `ROUTE_PROVIDER_API_KEY`, `ROUTE_PROVIDER_TIMEOUT_MS` | no | see `.env.example` | Walking-route adapter (Issue #4). `valhalla` (template default) gets real walking times from Valhalla's public instance, no key needed; `deterministic` (code default when unset) computes a straight-line estimate locally with no external call; `external` is a generic adapter that requires `ROUTE_PROVIDER_URL`. See Issue #4 §5.1. |

Variables already set in the shell take precedence over `.env`.

### 3.1 JWT secrets

Generate two **different** random values and paste them into `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Startup is refused (the error names the variable, never its value) when a secret is missing,
shorter than 32 characters, has fewer than 10 distinct characters, contains a placeholder
word (`replace`, `changeme`, `example`, `placeholder`, `secret`, `password`, ...), or when both
secrets are equal. Every developer and every environment should have its own secrets.
Changing `JWT_REFRESH_SECRET` logs out every session; changing `JWT_ACCESS_SECRET` invalidates
current access tokens (clients recover through refresh).

## 4. PostgreSQL (Docker Compose)

```bash
docker compose up -d postgres     # start (waits for nothing; check health below)
docker compose ps                 # STATUS should show "(healthy)"
docker compose logs -f postgres   # logs
docker compose stop postgres      # stop, keep data
docker compose down               # remove container, keep the named volume
docker compose down -v            # remove container AND data (destructive)
```

Development credentials (match `.env.example`): database `campusmeal`, user `campusmeal`,
password `campusmeal_dev`. Data persists in the `campusmeal_postgres_data` volume.

Open a SQL shell:

```bash
docker compose exec postgres psql -U campusmeal -d campusmeal
```

## 5. Migrations

`synchronize` is always disabled: every schema change is a migration in
`src/database/migrations`. The CLI uses `src/database/data-source.ts`, which reads the same
`.env` and the same options as the app.

| Command | Purpose |
|---|---|
| `npm run migration:run` | Apply pending migrations. |
| `npm run migration:show` | List migrations (`[X]` = applied, `[ ]` = pending). |
| `npm run migration:revert` | Revert the most recent migration. |
| `npm run migration:create -- src/database/migrations/AddSomething` | Create an empty migration. |
| `npm run migration:generate -- src/database/migrations/AddSomething` | Generate a migration from entity changes (needs a running database). |
| `npm run migration:run:prod` | Apply migrations from compiled `dist/` (used in the container). |

Current migrations:

| Migration | Creates |
|---|---|
| `1790089200000-CreateAppMetadata` (Issue #1) | `app_metadata` |
| `1790094600000-CreateUsersAndRefreshSessions` (Issue #2) | `user_role` enum, `users`, `refresh_sessions` |

Updating an existing Issue #1 database: `npm run migration:run` applies only the pending Issue #2
migration. `npm run migration:revert` removes only the newest migration (Issue #2: drops
`refresh_sessions`, `users` and `user_role`, **deleting all accounts**; `app_metadata` is kept).

The CLI validates the full environment, so the JWT variables must be set for migration commands too.

Rules for the team:

- Never edit a migration that has been merged; add a new one.
- Every migration must have a working `down()`. Check with `migration:revert` then `migration:run`.
- Entities live in their feature module (`src/<module>/entities/*.entity.ts`); the glob
  `src/**/*.entity.ts` picks them up. After writing a migration by hand, `migration:generate`
  should report "No changes in database schema were found".

## 5.1 Demo users (auth seed)

```bash
npm run seed:auth
```

Creates `DEMO_USER_EMAIL` with role `USER` and `DEMO_ANALYST_EMAIL` with role `ANALYST`, using
the same Argon2id hashing as registration. Passwords come from `DEMO_USER_PASSWORD` and
`DEMO_ANALYST_PASSWORD` (same policy as registration) and are only required for this command.

The seed is idempotent: existing accounts are reported as `already exists, left unchanged` and
are never modified (their passwords are not replaced). To reset a demo password, delete the user
(its sessions cascade) and seed again:

```bash
docker compose exec postgres psql -U campusmeal -d campusmeal -c "DELETE FROM users WHERE email = 'demo@campusmeal.local'"
```

In the container: `npm run seed:auth:prod` (compiled seed).

## 5.2 Trying the authentication flow with curl

Replace the placeholder values; never paste real tokens into shared documents or chats.

```bash
API=http://localhost:3000/api/v1

# Register (201) - returns { accessToken, refreshToken }
curl -i -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"fullName":"Test Student","email":"student@example.edu","password":"ExamplePassword123"}'

# Login (200)
curl -i -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"student@example.edu","password":"ExamplePassword123"}'

# Current user (200)
curl -i $API/auth/me -H 'Authorization: Bearer <accessToken>'

# Refresh (200) - store the NEW pair; the submitted refresh token stops working
curl -i -X POST $API/auth/refresh -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}'

# Logout (204, empty body)
curl -i -X POST $API/auth/logout -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<latest refreshToken>"}'
```

On Windows PowerShell use `curl.exe` and escape the JSON quotes, or use Swagger UI
(`/api/docs` → **Authorize** with the access token).

## 5.3 Demo inventory seed (BQ2)

```bash
npm run seed:auth        # required first: the inventory seed needs the demo user
npm run seed:inventory
```

In the container: `npm run seed:inventory:prod` (compiled seed).

Adds six items to `DEMO_USER_EMAIL` (default `demo@campusmeal.local`) with expiration dates
**relative to today in America/Bogota**, so BQ2 stays demonstrable whenever it runs:

| Item | Expires | Active | In `withinDays=3`? |
|---|---|---|---|
| Yogurt | today | yes | yes (`remainingDays` 0) |
| Whole milk | +1 day | yes | yes |
| Spinach | +3 days | yes | yes (inclusive edge) |
| Rice | +30 days | yes | no (outside the window) |
| Bread | −1 day | yes | no (expired; still in `GET /inventory`) |
| Cheese | +2 days | **no** | no (inactive; hidden everywhere) |

The rows have fixed ids, so the seed is idempotent: re-running **refreshes those same six rows**
(including their dates) instead of creating duplicates. It only touches the demo user's seed rows
and fails with `Run npm run seed:auth first.` when that user does not exist. It prints no
passwords or tokens.

## 5.4 Trying the inventory flow with curl

```bash
API=http://localhost:3000/api/v1
TOKEN=<accessToken from /auth/login>

# BQ2: items expiring within 3 days, already in consumption order (200)
curl -i "$API/inventory/expiring?withinDays=3" -H "Authorization: Bearer $TOKEN"

# All active items, expired ones included (200)
curl -i $API/inventory -H "Authorization: Bearer $TOKEN"

# Create (201) - expirationDate is a calendar date YYYY-MM-DD
curl -i -X POST $API/inventory -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Whole milk","quantity":1.0,"unit":"L","expirationDate":"2026-09-25"}'

# Update any subset of the fields (200)
curl -i -X PATCH $API/inventory/<itemId> -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"quantity":0.5}'

# Deactivate: soft delete, 204 with an empty body
curl -i -X DELETE $API/inventory/<itemId> -H "Authorization: Bearer $TOKEN"
```

## 6. Everyday commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | Start with watch mode. |
| `npm run start:debug` | Watch mode + Node inspector. |
| `npm run build` | Compile to `dist/`. |
| `npm run start:prod` | Run the compiled app (`node dist/main`). |
| `npm run lint` / `npm run lint:fix` | ESLint (type-aware rules). |
| `npm run format` / `npm run format:check` | Prettier. |

## 7. Docker image

```bash
docker build -t campusmeal-api .

# Configuration comes from your .env (never baked into the image); DATABASE_URL is
# overridden so the container reaches the Compose PostgreSQL on the host.
DB=postgresql://campusmeal:campusmeal_dev@host.docker.internal:5432/campusmeal

# Apply migrations / seed demo users with the compiled scripts
docker run --rm --env-file .env -e NODE_ENV=production -e DATABASE_URL=$DB campusmeal-api npm run migration:run:prod
docker run --rm --env-file .env -e NODE_ENV=production -e DATABASE_URL=$DB campusmeal-api npm run seed:auth:prod

# Run the API
docker run --rm -p 3000:3000 --env-file .env -e NODE_ENV=production -e PORT=3000 -e DATABASE_URL=$DB campusmeal-api
```

`host.docker.internal` reaches the Compose PostgreSQL published on the host (Docker Desktop;
on Linux add `--add-host=host.docker.internal:host-gateway`). The image contains only the
compiled app and production dependencies, runs as the unprivileged `node` user, and never
contains `.env`: pass configuration at run time.

## 8. Connecting the mobile clients

- Android emulator: `http://10.0.2.2:3000/api/v1`
- iOS simulator: `http://localhost:3000/api/v1`
- Physical device: `http://<your computer's LAN IP>:3000/api/v1` (same Wi-Fi; allow port 3000
  in the firewall). Android requires cleartext HTTP to be allowed for development builds.

## 9. Common problems

| Symptom | Cause / fix |
|---|---|
| `Invalid environment configuration: - "DATABASE_URL" is required` | `.env` missing or incomplete. Copy `.env.example` to `.env`. |
| `"JWT_ACCESS_SECRET" looks like a placeholder or weak value` (or `is required`) | Generate secrets as in section 3.1. Existing Issue #1 `.env` files still contain `replace-in-issue-2`. |
| `"JWT_REFRESH_SECRET" must be a random value different from JWT_ACCESS_SECRET` | Use two different generated values. |
| `npm install` fails in `argon2` with `gyp ERR! find VS` / "Could not find any Visual Studio installation" | npm could not use argon2's prebuilt binary and fell back to compiling C++. The project pins `argon2@0.44.x`, whose Windows/macOS/Linux prebuilds load on Node 20.17+. If it still happens: check Node is 64-bit (`node -p process.arch` → `x64`/`arm64`), delete `node_modules` and reinstall. Do not replace argon2 with another hashing library. |
| `[seed:auth] ... already exists, left unchanged` | Expected on re-runs; the seed never overwrites accounts (see 5.1). |
| `/auth/refresh` returns `401 INVALID_REFRESH_TOKEN` while another request just refreshed successfully | Expected: the client sent the same refresh token twice (e.g. two refreshes in parallel). Only one wins; the winner's new token remains valid. Make the client use a single-flight refresh and reuse the stored new tokens. |
| `/auth/refresh` returns `401 REFRESH_SESSION_REVOKED` | The session was logged out. Log in again. |
| `Bind for 0.0.0.0:5432 failed: port is already allocated` or the app connects to the wrong database / `password authentication failed` | Another PostgreSQL (e.g. a native Windows install) already uses 5432. Set `POSTGRES_PORT=5433` in `.env`, change `DATABASE_URL` to `...@localhost:5433/...`, then `docker compose up -d postgres`. |
| `Unable to connect to the database. Retrying (1)...` then exit | PostgreSQL not running or not healthy yet. `docker compose ps`; wait for `(healthy)`. The app retries 5 times, 3 s apart. |
| `error during connect: ... dockerDesktopLinuxEngine` | Docker Desktop is not running. Start it and retry. |
| `EADDRINUSE: address already in use :::3000` | Another process uses port 3000. Stop it or change `PORT`. |
| `relation "..." does not exist` | Migrations not applied: `npm run migration:run`. |
| `No migrations are pending` but tables are missing | You are pointing at a different database than you think; check `DATABASE_URL` and `POSTGRES_PORT`. |
| `npm warn EBADENGINE ... node: '^20.19.0 \|\| ^22.13.0 \|\| >=24'` | Node is older than 20.19. Upgrade to Node 22 or 24 LTS. |
| Lint/format fail with line-ending errors on Windows | The repo enforces LF via `.gitattributes`. Run `npm run format` and ensure your editor uses LF. |
| Health returns `503 SERVICE_UNAVAILABLE` | The API is up but PostgreSQL is not reachable; check the container. |
