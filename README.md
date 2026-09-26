# CampusMealBack

Shared REST backend for the CampusMeal Android (Kotlin) and iOS (Swift) apps.
NestJS 11 · TypeScript · PostgreSQL · TypeORM migrations · JWT auth · Swagger.

## Quick start

```bash
npm install
cp .env.example .env        # then set random JWT secrets (see docs/BACKEND_SETUP.md §3.1)
docker compose up -d postgres
npm run migration:run
npm run seed:auth           # optional demo USER / ANALYST (needs DEMO_* passwords)
npm run seed:restaurants    # demo restaurant catalog for BQ4/BQ5
npm run seed:inventory      # optional demo inventory for BQ2 (after seed:auth)
npm run start:dev
```

- Health: <http://localhost:3000/api/v1/health>
- API docs: <http://localhost:3000/api/docs>
- Auth: `POST /api/v1/auth/{register,login,refresh,logout}`, `GET /api/v1/auth/me`.
  Register sends `fullName`; `/auth/me` returns `name`. Refresh tokens are single use, so
  clients must run one refresh at a time (see the API contract).
- Inventory (BQ2): `GET|POST /api/v1/inventory`, `GET /api/v1/inventory/expiring?withinDays=3`,
  `PATCH|DELETE /api/v1/inventory/:id`. Per-user items; the backend calculates `remainingDays`
  in `America/Bogota` and returns them in consumption priority order.
- Restaurants (BQ4): `POST /api/v1/restaurants/search`, `GET /api/v1/restaurants/:id`. Walking times
  come from `RouteProviderPort`: `ROUTE_PROVIDER_MODE=valhalla` uses real pedestrian times from the
  public Valhalla instance (no key; coordinates are sent to it); `deterministic` is an offline
  straight-line estimate.
- Meal decisions (BQ5): `POST /api/v1/meal-decisions/compare` ranks Cook / Walk / Order.
- Analytics (BQ8): `POST /api/v1/analytics/events` (202, idempotent by `clientEventId`),
  `GET /api/v1/analytics/explanation-selection` (`ANALYST` only).

## Documentation

- [API contract](docs/API_CONTRACT.md): conventions every endpoint follows (prefix, direct responses, error format, data formats).
- [Backend setup](docs/BACKEND_SETUP.md): requirements, environment, database, migrations, Docker, troubleshooting.
- [Issue #1 – Backend foundation](docs/ISSUE_01_BACKEND_FOUNDATION.md): what was built, decisions and validation evidence.
- [Backend implementation](docs/BACKEND_IMPLEMENTATION.md): modules, business questions and how features fit together.
- [Issue #2 – Authentication](docs/ISSUE_02_AUTHENTICATION.md): JWT sessions, refresh rotation, roles, seed and security checks.
- [Issue #3 – Inventory](docs/ISSUE_03_INVENTORY.md): inventory CRUD, BQ2 expiring items, seed and validation evidence.
- [Issue #4 – Restaurant catalog](docs/ISSUE_04_RESTAURANT_CATALOG.md): entities, seed and route-provider adapters.
- [Issue #5 – Context-aware search](docs/ISSUE_05_CONTEXT_AWARE_SEARCH.md): BQ4 search rules and verification.
- [Issue #6 – Meal decisions](docs/ISSUE_06_MEAL_DECISIONS.md): BQ5 Cook / Walk / Order scoring.
- [Issue #7 – Analytics](docs/ISSUE_07_ANALYTICS_BQ8.md): recommendation events and BQ8.

## Project layout

```text
src/
├── config/        environment validation, typed configuration, Swagger
├── common/        error format, validation, request logging, shared enums/DTOs
├── database/      TypeORM options, CLI data source, migrations, entities, seeds
├── health/        GET /api/v1/health
├── auth/          register/login/refresh/logout/me, JWT guard, @Auth()/@Roles(), @CurrentUser()
├── users/         User and RefreshSession entities, UsersService
├── inventory/     inventory CRUD and BQ2 expiring items (entity, repository, service)
├── restaurants/   restaurant catalog and context-aware search
├── routes/        walking-route provider adapters
└── recommendations/ analytics/
                   feature modules (added by later issues)
```
