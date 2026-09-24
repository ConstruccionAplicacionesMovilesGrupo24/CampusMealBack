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
| 401 | `INVALID_CREDENTIALS` | Login failed: unknown email **or** wrong password (indistinguishable). |
| 401 | `INVALID_ACCESS_TOKEN` | Bearer access token missing, malformed, expired or of the wrong type. |
| 401 | `INVALID_REFRESH_TOKEN` | Refresh token malformed, expired, of the wrong type, already used (rotated), or its session is unknown/expired. |
| 401 | `REFRESH_SESSION_REVOKED` | The session was logged out. |
| 401 | `USER_INACTIVE` | The account is deactivated. |
| 401 | `UNAUTHORIZED` | Generic 401 fallback (not produced by the auth endpoints). |
| 403 | `FORBIDDEN` | Authenticated but the role is not allowed. |
| 409 | `EMAIL_ALREADY_REGISTERED` | Registration with an email that already has an account. |
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

## 5. Authentication

### Tokens

| Token | Lifetime (default) | Used for | Sent as |
|---|---|---|---|
| Access token (JWT) | 15 minutes (`JWT_ACCESS_TTL`) | Every protected endpoint | `Authorization: Bearer <accessToken>` header |
| Refresh token (JWT) | 7 days (`JWT_REFRESH_TTL`), renewed on every refresh | `POST /auth/refresh`, `POST /auth/logout` | JSON body `{ "refreshToken": "..." }` |

- Store both tokens securely (Android Keystore-backed storage / iOS Keychain). Never log them,
  never put them in URLs.
- Treat tokens as **opaque strings**. Do not decode them to read user data; call `GET /auth/me`.
- The bearer scheme is case-sensitive as sent by the clients: `Bearer <token>` with one space.

### Token DTO (register, login, refresh)

```json
{
  "accessToken": "example-access-token",
  "refreshToken": "example-refresh-token"
}
```

Matches Android `TokenResponseDto(accessToken, refreshToken)`. No other fields.

### Current-user DTO (`GET /auth/me`)

```json
{
  "id": "3f0c6f5e-1b2a-4c3d-9e8f-7a6b5c4d3e2f",
  "name": "CampusMeal Demo",
  "email": "demo@campusmeal.local",
  "role": "USER"
}
```

`role` is `USER` or `ANALYST`. Clients must tolerate new role values (fall back to `USER` behavior).

### Session lifecycle

1. Register or log in → store both tokens.
2. Call protected endpoints with the access token.
3. On `401 INVALID_ACCESS_TOKEN` from a protected endpoint, call `POST /auth/refresh` **once**
   with the stored refresh token, store the **new pair**, and retry the request once.
4. If refresh fails with 401 (`INVALID_REFRESH_TOKEN`, `REFRESH_SESSION_REVOKED`,
   `USER_INACTIVE`), clear tokens and show the login / session-expired screen.
5. Logout: `POST /auth/logout` with the refresh token (best effort), then clear local tokens.

**Refresh tokens are single use.** The server rotates them with an atomic compare-and-swap:

- Every successful refresh replaces the session's token; the submitted token stops working.
- If several requests submit the same token at the same time, **exactly one** succeeds. The
  others receive `401 INVALID_REFRESH_TOKEN` and **do not** affect the session: the winner's new
  refresh token stays valid.
- An old (already rotated) token is always rejected with `401 INVALID_REFRESH_TOKEN`; the
  session's current token keeps working.
- The current token stays valid until it expires, is rotated again, is logged out, or the user
  becomes inactive.

Clients must still use a **single-flight** refresh: when several requests fail with 401 at the
same time, only one refresh may be in flight; the others wait and reuse the tokens it stored.
Without it, the losing callers get 401 from `/auth/refresh` and would wrongly end the session
on the device even though the server session is fine.

Full token-family replay detection (revoking a session when an old token is replayed) is not
implemented: a replayed old token only gets 401. This is an accepted prototype trade-off.

### Field names and password policy (both clients)

| Where | Field | Notes |
|---|---|---|
| `POST /auth/register` request | `fullName` | Not `name`. Matches Android `RegisterRequestDto`. |
| `GET /auth/me` response | `name` | Not `fullName`. |

Password policy for new passwords (the backend is authoritative; clients validate the same rule
before submitting): **at least 8 characters** (maximum 128), **at least one uppercase letter,
one lowercase letter and one number**. Example accepted: `DemoPassword123!`; rejected:
`password1` (no uppercase). Login does not re-check the policy.

Access tokens are stateless: after logout, an already-issued access token keeps working until
it expires (at most `JWT_ACCESS_TTL`). Role changes and account deactivation apply immediately,
because the server reloads the user on every authenticated request.

## 6. Endpoints

### `POST /api/v1/auth/register` (public)

```json
{
  "fullName": "CampusMeal Demo",
  "email": "demo@campusmeal.local",
  "password": "ExamplePassword123"
}
```

- `fullName`: 1–100 characters after trimming. (Field name matches Android's `RegisterRequestDto`.)
- `email`: valid email, max 254; trimmed and lowercased by the server.
- `password`: 8–128 characters with at least one uppercase letter, one lowercase letter and one
  number. Not trimmed.
- No other fields are accepted (a `role` field, for example, is rejected with 400).

| Status | Body |
|---|---|
| **201** | Token DTO. The new account has role `USER` and is already signed in. |
| 400 | `VALIDATION_ERROR` (message lists every problem, e.g. `password must contain at least one uppercase letter`). |
| 409 | `EMAIL_ALREADY_REGISTERED` (also for case/whitespace variants of an existing email). |

### `POST /api/v1/auth/login` (public)

```json
{ "email": "demo@campusmeal.local", "password": "ExamplePassword123" }
```

| Status | Body |
|---|---|
| **200** | Token DTO. Creates a new session. |
| 400 | `VALIDATION_ERROR` (e.g. malformed email, empty password). |
| 401 | `INVALID_CREDENTIALS` — identical for unknown email and wrong password. |
| 401 | `USER_INACTIVE` — only returned when the password is correct. |

### `POST /api/v1/auth/refresh` (refresh token in body)

```json
{ "refreshToken": "example-refresh-token" }
```

| Status | Body |
|---|---|
| **200** | New token DTO (both tokens replaced). |
| 400 | `VALIDATION_ERROR` (missing/empty `refreshToken`). |
| 401 | `INVALID_REFRESH_TOKEN`, `REFRESH_SESSION_REVOKED` or `USER_INACTIVE`. |

### `POST /api/v1/auth/logout` (refresh token in body)

```json
{ "refreshToken": "example-refresh-token" }
```

No access token is required, so logout works even after the access token expired (an
`Authorization` header, as Android currently sends, is accepted and ignored).

| Status | Body |
|---|---|
| **204** | **Empty body.** The session is revoked; its refresh token no longer works. |
| 400 | `VALIDATION_ERROR`. |
| 401 | `INVALID_REFRESH_TOKEN` (invalid/expired/unknown/already rotated; the session is not changed) or `REFRESH_SESSION_REVOKED` (already logged out). Logout is not idempotent: a second call returns 401. Clients should clear local tokens regardless of the result. |

### `GET /api/v1/auth/me` (bearer access token)

```http
Authorization: Bearer <accessToken>
```

| Status | Body |
|---|---|
| **200** | Current-user DTO. Never contains password hashes, token hashes or session data. |
| 401 | `INVALID_ACCESS_TOKEN` (missing, invalid, expired, or a refresh token was sent) or `USER_INACTIVE`. |

### Role-restricted endpoints (from later issues)

Endpoints restricted to a role (e.g. analytics, `ANALYST` only) return
`403 FORBIDDEN` to authenticated users without that role, and 401 without a valid token.

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
- Auth DTOs map 1:1 to the Android models: `RegisterRequestDto(fullName, email, password)`,
  `LoginRequestDto(email, password)`, `LogoutRequestDto(refreshToken)`,
  `TokenResponseDto(accessToken, refreshToken)`. Swift clients use the same JSON keys
  (`fullName`, not `name`, in the registration request; `name` in the `/auth/me` response).
- `POST /auth/logout` returns 204 with no body: Retrofit should declare `Unit`/`Response<Unit>`;
  Swift must not try to decode a body for 204.
- Distinguish credential errors from connectivity: 401 on `/auth/login` means wrong
  credentials, not an expired session.


## 8. Context-aware restaurant search (BQ4)

### `POST /api/v1/restaurants/search` (bearer access token)

```json
{
  "location": { "latitude": 4.6025, "longitude": -74.0653 },
  "campusId": "campus-001",
  "availableMinutes": 45,
  "maximumBudget": 20000,
  "dietaryPreferences": ["VEGETARIAN"],
  "includeDelivery": true,
  "requestedAt": "2026-09-21T17:30:00Z"
}
```

The endpoint evaluates opening hours at `requestedAt`, requires at least one available meal within
the budget and dietary context, asks the backend `RouteProviderPort` for walking estimates and
filters known routes that do not fit `availableMinutes`. When route estimates are unavailable,
otherwise valid restaurants remain in the response with `walkingMinutes` and
`estimatedTotalMinutes` set to `null`.

Successful searches return HTTP 200, including the no-results case:

```json
{
  "restaurants": [],
  "lastUpdatedAt": "2026-09-21T17:30:02.000Z",
  "routeProviderStatus": "AVAILABLE"
}
```

`routeProviderStatus` is `AVAILABLE`, `PARTIAL` or `UNAVAILABLE`.

### `GET /api/v1/restaurants/:restaurantId` (bearer access token)

Returns the active restaurant and its currently available meals. Because this endpoint receives no
origin/context, its route fields are `null` and `routeProviderStatus` is `UNAVAILABLE`; the backend
does not retain exact coordinates from an earlier search just to populate detail responses.

