# CampusMealBack

Shared REST backend for the CampusMeal Android (Kotlin) and iOS (Swift) apps.
NestJS 11 · TypeScript · PostgreSQL · TypeORM migrations · Swagger.

## Quick start

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run migration:run
npm run start:dev
```

- Health: <http://localhost:3000/api/v1/health>
- API docs: <http://localhost:3000/api/docs>

## Documentation

- [API contract](docs/API_CONTRACT.md): conventions every endpoint follows (prefix, direct responses, error format, data formats).
- [Backend setup](docs/BACKEND_SETUP.md): requirements, environment, database, migrations, Docker, troubleshooting.
- [Issue #1 – Backend foundation](docs/ISSUE_01_BACKEND_FOUNDATION.md): what was built, decisions and validation evidence.

## Project layout

```text
src/
├── config/        environment validation, typed configuration, Swagger
├── common/        error format, validation, request logging, shared enums/DTOs
├── database/      TypeORM options, CLI data source, migrations, entities, seeds
├── health/        GET /api/v1/health
└── auth/ users/ inventory/ restaurants/ routes/ recommendations/ analytics/
                   feature modules (added by later issues)
```
