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
npm run start:dev
```

- Health: <http://localhost:3000/api/v1/health>
- API docs: <http://localhost:3000/api/docs>
- Auth: `POST /api/v1/auth/{register,login,refresh,logout}`, `GET /api/v1/auth/me`.
  Register sends `fullName`; `/auth/me` returns `name`. Refresh tokens are single use, so
  clients must run one refresh at a time (see the API contract).

## Documentation

- [API contract](docs/API_CONTRACT.md): conventions every endpoint follows (prefix, direct responses, error format, data formats).
- [Backend setup](docs/BACKEND_SETUP.md): requirements, environment, database, migrations, Docker, troubleshooting.
- [Issue #1 – Backend foundation](docs/ISSUE_01_BACKEND_FOUNDATION.md): what was built, decisions and validation evidence.
- [Issue #2 – Authentication](docs/ISSUE_02_AUTHENTICATION.md): JWT sessions, refresh rotation, roles, seed and security checks.

## Project layout

```text
src/
├── config/        environment validation, typed configuration, Swagger
├── common/        error format, validation, request logging, shared enums/DTOs
├── database/      TypeORM options, CLI data source, migrations, entities, seeds
├── health/        GET /api/v1/health
├── auth/          register/login/refresh/logout/me, JWT guard, @Auth()/@Roles(), @CurrentUser()
├── users/         User and RefreshSession entities, UsersService
└── inventory/ restaurants/ routes/ recommendations/ analytics/
                   feature modules (added by later issues)
```
