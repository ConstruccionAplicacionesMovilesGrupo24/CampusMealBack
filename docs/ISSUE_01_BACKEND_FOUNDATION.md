# Issue #1 – Backend Foundation

**Status:** Complete. All required validation commands were executed locally on 2026-09-22
(Windows 11, Node 20.17.0, npm 10.8.2, Docker 28.3.2 / Compose 2.39.1).

## 1. What was implemented

- NestJS 11 project initialized in the repository root (no nested project), TypeScript,
  ESLint 10 (flat config, type-aware rules) and Prettier.
- Typed, validated environment configuration (`@nestjs/config` global module + Joi).
- PostgreSQL through TypeORM with `synchronize: false`, migrations and a CLI data source.
- One reversible foundation migration (`app_metadata` table).
- `GET /api/v1/health` with a real PostgreSQL check (200 / 503).
- Global error format `{ statusCode, code, message, timestamp, path }`.
- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) with readable messages.
- Safe request-logging interceptor.
- Swagger/OpenAPI at `/api/docs` with bearer-auth definition.
- Docker Compose (PostgreSQL only) and a multi-stage production Dockerfile.
- Empty placeholder folders for the future modules: `auth`, `users`, `inventory`,
  `restaurants`, `routes`, `recommendations`, `analytics`.

Not implemented (out of scope): authentication, business entities/endpoints, route provider,
recommendations, analytics, seeds, Redis/queues, CI/CD, deployment.

## 2. Architecture decisions

| Decision | Reason / impact on later issues |
|---|---|
| **NestJS 11 (CommonJS), not NestJS 12.** | NestJS 12 (npm `latest` since recently) is ESM-only. With CommonJS, Node < 20.19 cannot load it, and ESM would require an ESM toolchain for ts-node and the TypeORM CLI. NestJS 11 is still maintained (npm `legacy` tag) and is what npm resolved. Upgrade to 12 as a dedicated issue if needed. Package ranges (`^11.x`) prevent accidental major upgrades. |
| `@nestjs/config` 4.x | v12 of this package is also ESM-only; 4.x is the NestJS 11 line. |
| TypeScript 5.9 (not 7) | TypeScript 7 (native port) is not supported by typescript-eslint or ts-node. |
| ESLint 10 | ESLint 9 is deprecated on npm. ESLint 10 declares Node ≥ 20.19; `engines` reflects that. |
| `overrides.multer: ^2.4.0` | `@nestjs/platform-express` 11 pins `multer` 2.2.0, which has high-severity advisories. 2.4.0 is the same major. `npm audit` reports 0 vulnerabilities. Remove the override when Nest ships a fixed version. |
| Direct DTO responses, no wrapper | Required by the Android client. No response interceptor transforms bodies. |
| Single DB options builder | `src/database/database.options.ts` is used by both the Nest `DatabaseModule` and the CLI `data-source.ts`, so there is one configuration. |
| Env validation shared by app and CLI | `validateEnvironment()` is used by `ConfigModule` and by `data-source.ts`. |
| JSON body parser registered explicitly | Needed so parser errors (whose messages can quote the request body) are replaced by fixed messages. Only JSON bodies are parsed; add `app.useBodyParser('urlencoded')` if a later issue needs forms. |
| Compose host port overridable (`POSTGRES_PORT`) | Developer machines may already run PostgreSQL on 5432 (this one does). |
| Swagger always enabled | Simplifies client integration during the course. Decide per environment before any public deployment. |

## 3. Main files

| File | Purpose |
|---|---|
| `src/main.ts` | Bootstrap: prefix `api/v1`, JSON parser, pipe, filter, interceptor, shutdown hooks, Swagger, port. |
| `src/app.module.ts` | Root module: `ConfigModule` (global), `DatabaseModule`, `HealthModule`. |
| `src/config/environment.validation.ts` | Joi schema + `validateEnvironment()`. |
| `src/config/configuration.ts` | Typed `Configuration` (`app`, `database`). Use `ConfigService<Configuration, true>`. |
| `src/config/swagger.config.ts` | OpenAPI document and UI at `/api/docs`. |
| `src/database/database.options.ts` | TypeORM options (single source of truth). |
| `src/database/database.module.ts` | `TypeOrmModule.forRootAsync` using the options above. |
| `src/database/data-source.ts` | Data source for the TypeORM CLI. |
| `src/database/migrations/1790089200000-CreateAppMetadata.ts` | Foundation migration. |
| `src/common/filters/http-exception.filter.ts` | Global error format. |
| `src/common/interceptors/request-logging.interceptor.ts` | Safe request logging. |
| `src/common/validation/validation-exception.factory.ts` | Class-validator errors → `VALIDATION_ERROR`. |
| `src/common/validation/body-parser-error.handler.ts` | Malformed/oversized JSON → `INVALID_JSON` / `PAYLOAD_TOO_LARGE`. |
| `src/common/enums/error-code.enum.ts` | Stable error codes and status → code mapping. |
| `src/common/dto/error-response.dto.ts` | Error body type (also used by Swagger). |
| `src/health/*` | Health module, controller, service and response DTO. |
| `docker-compose.yml`, `Dockerfile`, `.dockerignore` | Local PostgreSQL and production image. |
| `.env.example`, `.gitignore`, `.gitattributes` | Env template, ignores (incl. `.env`), LF line endings. |
| `tsconfig*.json`, `nest-cli.json`, `eslint.config.mjs`, `.prettierrc` | Tooling. |

## 4. Environment variables

Required and validated at startup: `NODE_ENV` (`development|production|test`), `PORT` (valid
port), `DATABASE_URL` (`postgres://` or `postgresql://` URI), `APP_TIMEZONE` (valid IANA zone).
Optional: `DATABASE_SSL` (default `false`), `POSTGRES_PORT` (Compose only). Reserved and
optional: `JWT_*` (Issue #2) and `ROUTE_PROVIDER_*`. Details in [BACKEND_SETUP.md](BACKEND_SETUP.md).

Invalid configuration stops the app before it listens, listing every problem without echoing
values. Verified output (with an invalid URL containing a password):

```text
Error: Invalid environment configuration:
  - "NODE_ENV" must be one of [development, production, test]
  - "PORT" must be a valid port
  - "DATABASE_URL" must be a valid uri with a scheme matching the postgres|postgresql pattern
  - "APP_TIMEZONE" must be a valid IANA time zone
Check your .env file against .env.example.
```

## 5. Database and migration design

- `synchronize: false` and `migrationsRun: false`: migrations are always applied explicitly.
- Migration history table: `typeorm_migrations`.
- Globs use `.ts` under ts-node (CLI) and `.js` in `dist/` (app and container):
  entities `src/database/entities/*.entity.ts`, migrations `src/database/migrations/*.ts`.
- `logging: false` so query parameters never reach the app logs. (The TypeORM CLI prints the
  SQL it runs during `migration:*` commands; that is developer tooling only.)
- `connectionTimeoutMillis: 5000` so the health check fails fast instead of hanging.
- SSL is controlled by `DATABASE_SSL`; local Docker uses no SSL.
- Foundation migration creates `app_metadata(key varchar(100) PK, value text, created_at
  timestamptz, updated_at timestamptz)`; `down()` drops it. It contains no business data and no
  `IF EXISTS`/`CASCADE` fallbacks.

## 6. Error and logging behavior

Errors (all go through `HttpExceptionFilter`):

- Status preserved; `code` from the exception payload or derived from the status.
- Validation: messages joined with `; `, nested paths prefixed (`address.city must be a string`).
- Unknown routes return `Route not found` (Nest's default message would echo the query string).
- Malformed JSON returns a fixed `INVALID_JSON` message (the parser's message can quote the body).
- Unexpected errors return `500 INTERNAL_ERROR` / `An unexpected error occurred`; the stack is
  logged server-side only.
- `path` never includes the query string.

Logging (`RequestLoggingInterceptor`, context `HTTP`): one line per request,
`METHOD /path STATUS DURATIONms`, logged on the response `finish` event so the final status is
recorded; `warn` for 4xx and `error` for 5xx. Headers, cookies, query strings and bodies are never
logged. Limitation: interceptors only run for matched routes, so unmatched routes (404) and
requests rejected by the body parser are answered correctly but not logged.

## 7. Validation results (actually executed)

| Command or check | Result |
|---|---|
| `npm install` | Passed (0 vulnerabilities with the `multer` override). One `EBADENGINE` warning on this machine's Node 20.17 (tooling wants ≥ 20.19); everything still ran. |
| `npm run build` | Passed |
| `npm run lint` | Passed (0 problems) |
| `npm run format:check` | Passed |
| `docker compose config` | Passed; only service: `postgres` |
| `docker compose up -d postgres` | Passed; container `healthy` (host port 5433, see §8) |
| `npm run migration:show` (empty DB) | Passed – `[ ] CreateAppMetadata1790089200000` |
| `npm run migration:run` | Passed – table created |
| `npm run migration:show` | Passed – `[X]` |
| `npm run migration:revert` | Passed – table dropped, history row deleted |
| `npm run migration:run` (again) | Passed – re-applied; `\d app_metadata` shows the expected columns |
| `npm run start:dev` | Passed – `CampusMeal API listening on port 3000` |
| `GET /api/v1/health` | 200 `{"status":"ok","database":"up","timestamp":"…Z"}` |
| `GET /api/v1/health` with PostgreSQL stopped | 503 `SERVICE_UNAVAILABLE` / `Database is unavailable` in ~70 ms; 200 again after restart |
| `GET /api/docs` | 200 (HTML); `/api/docs-json` has title `CampusMeal API`, version `1.0`, `bearer` scheme, health 200/503 responses |
| Unknown route with `?token=…&lat=…` | 404 `NOT_FOUND` / `Route not found`, `path` without query |
| Malformed JSON body containing a password | 400 `INVALID_JSON`, body not echoed |
| Body > 100 kB | 413 `PAYLOAD_TOO_LARGE` |
| DTO validation (temporary harness outside the repo) | 400 `VALIDATION_ERROR`: `property isAdmin should not exist; email must be an email; address.city must be a string`; valid body returned directly (no wrapper) |
| Invalid / missing environment | Startup aborted with the list shown in §4; secrets not printed |
| Log leak check | Requests sent with `Authorization`, `Cookie`, `?token=`, coordinates and a password; none appeared in the log |
| `docker build` | Passed; runtime image 375 MB, user `node`, no `.env`, no TypeScript/ESLint/Prettier |
| Container + Compose DB | `migration:run:prod` → `No migrations are pending`; health 200; Swagger 200 |
| `.env` ignored | Passed (`git check-ignore .env`) |
| No Redis/BullMQ/Passport/JWT packages | Passed (`npm ls` empty; lockfile mentions are TypeORM optional-peer metadata only) |
| No auth implementation, no success wrapper | Passed (source search) |

## 8. Limitations and notes

- **Local port conflict:** this development machine runs a native PostgreSQL on 5432, so
  validation used `POSTGRES_PORT=5433` and a matching `DATABASE_URL` in the local (ignored)
  `.env`. The committed defaults remain 5432.
- **Node version:** validation ran on Node 20.17, below the declared `^20.19.0 || >=22.13.0`.
  Everything worked, but developers should use Node 22 or 24 LTS. The Docker image uses Node 24.
- **No automated tests** were added, per the issue's scope; the project has no test runner.
- **Request logging** does not cover unmatched routes or body-parser rejections (see §6).
- **Swagger** is exposed in every environment; revisit before a public deployment.
