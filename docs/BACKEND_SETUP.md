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
docker compose up -d postgres
npm run migration:run
npm run start:dev
```

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
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | no | see `.env.example` | Reserved for Issue #2. Not used yet. |
| `ROUTE_PROVIDER_MODE`, `ROUTE_PROVIDER_URL`, `ROUTE_PROVIDER_API_KEY`, `ROUTE_PROVIDER_TIMEOUT_MS` | no | see `.env.example` | Reserved for the route-provider issue. Not used yet. |

Variables already set in the shell take precedence over `.env`.

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

Rules for the team:

- Never edit a migration that has been merged; add a new one.
- Every migration must have a working `down()`. Check with `migration:revert` then `migration:run`.
- Entities go in `src/database/entities/*.entity.ts` so the glob picks them up.

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

# Apply migrations with the compiled data source
docker run --rm \
  -e NODE_ENV=production -e PORT=3000 -e APP_TIMEZONE=America/Bogota \
  -e DATABASE_URL=postgresql://campusmeal:campusmeal_dev@host.docker.internal:5432/campusmeal \
  campusmeal-api npm run migration:run:prod

# Run the API
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production -e PORT=3000 -e APP_TIMEZONE=America/Bogota \
  -e DATABASE_URL=postgresql://campusmeal:campusmeal_dev@host.docker.internal:5432/campusmeal \
  campusmeal-api
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
| `Bind for 0.0.0.0:5432 failed: port is already allocated` or the app connects to the wrong database / `password authentication failed` | Another PostgreSQL (e.g. a native Windows install) already uses 5432. Set `POSTGRES_PORT=5433` in `.env`, change `DATABASE_URL` to `...@localhost:5433/...`, then `docker compose up -d postgres`. |
| `Unable to connect to the database. Retrying (1)...` then exit | PostgreSQL not running or not healthy yet. `docker compose ps`; wait for `(healthy)`. The app retries 5 times, 3 s apart. |
| `error during connect: ... dockerDesktopLinuxEngine` | Docker Desktop is not running. Start it and retry. |
| `EADDRINUSE: address already in use :::3000` | Another process uses port 3000. Stop it or change `PORT`. |
| `relation "..." does not exist` | Migrations not applied: `npm run migration:run`. |
| `No migrations are pending` but tables are missing | You are pointing at a different database than you think; check `DATABASE_URL` and `POSTGRES_PORT`. |
| `npm warn EBADENGINE ... node: '^20.19.0 \|\| ^22.13.0 \|\| >=24'` | Node is older than 20.19. Upgrade to Node 22 or 24 LTS. |
| Lint/format fail with line-ending errors on Windows | The repo enforces LF via `.gitattributes`. Run `npm run format` and ensure your editor uses LF. |
| Health returns `503 SERVICE_UNAVAILABLE` | The API is up but PostgreSQL is not reachable; check the container. |
