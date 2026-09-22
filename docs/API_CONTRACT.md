# CampusMeal API Contract

This contract applies to every endpoint of the CampusMeal backend and is shared by the
Android (Kotlin) and iOS (Swift) clients. Later issues add endpoints; they must not change
these conventions.

## 1. Base URL and versioning

| Environment | Base URL |
|---|---|
| Local development | `http://localhost:3000/api/v1` |
| Android emulator → host machine | `http://10.0.2.2:3000/api/v1` |
| iOS simulator → host machine | `http://localhost:3000/api/v1` |

- Every endpoint lives under the global prefix **`/api/v1`**.
- A breaking change requires a new prefix (`/api/v2`); `/api/v1` keeps working until both clients migrate.
- Interactive documentation (Swagger UI): `http://localhost:3000/api/docs`
  (raw OpenAPI JSON: `http://localhost:3000/api/docs-json`). Swagger is not under `/api/v1`.
- Requests and responses use `Content-Type: application/json` (UTF-8).

## 2. Successful responses: direct DTOs, no wrapper

Successful responses return the DTO **directly at the JSON root**. There is no generic
`success`/`data` envelope.

```json
{
  "items": []
}
```

Not allowed:

```json
{
  "success": true,
  "data": { "items": [] }
}
```

Clients decide success from the HTTP status code (2xx) and decode the body straight into
the endpoint's DTO (Kotlin data class / Swift `Codable` struct).

## 3. Error responses

Every non-2xx response has exactly this shape:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "email must be an email; property foo should not exist",
  "timestamp": "2026-09-22T15:30:00.000Z",
  "path": "/api/v1/example"
}
```

| Field | Type | Description |
|---|---|---|
| `statusCode` | integer | Same value as the HTTP status code. |
| `code` | string | Stable machine-readable code (table below). Clients may branch on it. |
| `message` | string | Human-readable English description. Safe to log; not meant for direct display without localization. |
| `timestamp` | string | ISO-8601 UTC instant when the error was produced. |
| `path` | string | Request path **without** the query string. |

Responses never include stack traces, request bodies, query strings, tokens, passwords or
provider credentials.

### Standard error codes

| HTTP status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | DTO validation failed (missing/invalid/unknown fields). |
| 400 | `INVALID_JSON` | Body is not valid JSON. |
| 400 | `BAD_REQUEST` | Other malformed requests (e.g. invalid path parameter). |
| 401 | `UNAUTHORIZED` | Missing/invalid/expired access token (from Issue #2). |
| 403 | `FORBIDDEN` | Authenticated but not allowed. |
| 404 | `NOT_FOUND` | Resource or route does not exist. |
| 405 | `METHOD_NOT_ALLOWED` | HTTP method not supported. |
| 409 | `CONFLICT` | State conflict (e.g. duplicated resource). |
| 413 | `PAYLOAD_TOO_LARGE` | Body exceeds the size limit. |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Unsupported content type. |
| 422 | `UNPROCESSABLE_ENTITY` | Semantically invalid request. |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded. |
| 503 | `SERVICE_UNAVAILABLE` | A dependency (e.g. PostgreSQL) is unavailable. |
| 500 | `INTERNAL_ERROR` | Unexpected server error. |

Feature modules may define more specific codes (e.g. `EMAIL_ALREADY_REGISTERED`) by throwing
an `HttpException` whose response is `{ code, message }`. Existing codes are never renamed.
Clients must treat unknown codes by falling back to the HTTP status.

## 4. Data formats

| Kind | Format | Example |
|---|---|---|
| Timestamps (instants) | ISO-8601, **UTC**, `Z` suffix | `"2026-09-22T15:30:00.000Z"` |
| Expiration dates (calendar dates) | `YYYY-MM-DD`, no time or zone | `"2026-10-05"` |
| Money | **Whole Colombian pesos** (COP) as JSON integers; no decimals, no strings, no currency symbol | `12500` |
| Identifiers | Strings (UUID format expected from later issues) | `"3f0c…"` |
| Field names | `camelCase` | `expirationDate` |

Notes:

- Timestamps are always emitted in UTC. Clients convert to the user's local zone for display.
  The server's business time zone (`APP_TIMEZONE`, default `America/Bogota`) is used only for
  server-side calendar logic such as "expires today".
- Expiration dates are calendar dates, not instants: parse them as `LocalDate` (Kotlin) /
  a date-only `DateComponents` or `DateFormatter("yyyy-MM-dd")` (Swift), never as UTC midnight.
- Money in COP: Kotlin `Long`/`Int`, Swift `Int`. Never use floating point for prices.

## 5. Authentication (from Issue #2)

Not implemented yet. Protected endpoints will require:

```http
Authorization: Bearer <access token>
```

Swagger already declares the `bearer` security scheme so protected endpoints can reference it.
Tokens will never appear in URLs, query strings, logs or error messages.

## 6. Endpoints available in Issue #1

### `GET /api/v1/health`

Checks that the API is running and PostgreSQL answers a query. No authentication.

**200 OK**

```json
{
  "status": "ok",
  "database": "up",
  "timestamp": "2026-09-22T15:30:00.000Z"
}
```

**503 Service Unavailable** (database unreachable)

```json
{
  "statusCode": 503,
  "code": "SERVICE_UNAVAILABLE",
  "message": "Database is unavailable",
  "timestamp": "2026-09-22T15:30:00.000Z",
  "path": "/api/v1/health"
}
```

The response never includes the database URL, host, credentials or stack traces.

## 7. Client compatibility rules (Kotlin and Swift)

- Decode success bodies directly into the endpoint DTO; decode any non-2xx body into a shared
  `ApiError { statusCode, code, message, timestamp, path }` model.
- Ignore unknown JSON fields (`ignoreUnknownKeys = true` in kotlinx.serialization / Moshi
  equivalents; Swift `Codable` ignores them by default). The server may add optional fields
  without a version bump.
- The server never removes or renames fields, or changes a field's type, within `/api/v1`.
- Optional fields are omitted or `null`; clients must handle both.
- Requests with unknown body fields are **rejected** with `400 VALIDATION_ERROR`
  (`forbidNonWhitelisted`), so clients must send only documented fields.
- Avoid sending sensitive values (tokens, precise coordinates) in URL paths or query strings
  unless an endpoint explicitly documents it.
