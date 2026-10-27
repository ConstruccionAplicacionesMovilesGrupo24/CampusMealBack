# Deployment validation: Render + Neon (backend HTTP smoke run)

| Item | Value |
|---|---|
| Target origin | `https://campusmeal-api.onrender.com` (API base `/api/v1/`, Swagger `/api/docs`, OpenAPI JSON `/api/docs-json`) |
| Run date | 2026-10-27, 15:55:38–15:55:53 UTC (10:55:38–10:55:53 America/Bogota) |
| Runner | One-off Node 24.22.1 script using built-in `fetch`, kept outside the repository and deleted afterwards. Credentials were loaded with `node --env-file=.env.render` and kept in memory. Redirects were never followed, and every request was checked against the target origin. |
| Requests sent | 48 (budget 60): no retries needed, no write retried |
| Deployed commit | **Unconfirmed.** The API exposes no build metadata. Render previously showed `20e523b`, and the local `HEAD` is also `20e523b`, but neither establishes what is live. |
| Result | **47 PASS, 1 FAIL, 0 BLOCKED, 0 NOT RUN.** The single FAIL is a defect in the runner's expectation, not in the API (see FLOW-3). |

This report covers backend HTTP behavior only. It does not validate the Android/iOS apps or
Sprint 3 as a whole.

## 1. Sources of evidence

- **Prior user observations (not re-counted here):** health returned `200 {status:"ok", database:"up"}`;
  `/` and `/api/v1/` returned the structured `404 NOT_FOUND`.
- **Executed against Render in this run:** every row in section 3.
- **Local verification:** none against the deployed service. Local source was read only to build
  valid requests and expectations (DTOs, `auth.service.ts`, `jwt-access.strategy.ts`,
  `inventory.repository.ts`, `recommendations.service.ts`, `analytics.service.ts`, seeds,
  `swagger.config.ts`). No source was changed, so no build was run.

## 2. Side effects reviewed before running

| Concern | Finding in source | Consequence for this run |
|---|---|---|
| Registration side effects | `AuthService.register` only inserts a `users` row and a `refresh_sessions` row; no email or messaging. | One dedicated smoke account was registered. |
| Automatic analytics | No controller or service outside `analytics/` writes `analytics_events` or `usage_events`. | Ordinary reads/writes emit no analytics. Valid analytics events were **not** sent. |
| Meal comparison | `RecommendationsService.compare` persists a recommendation run (`recommendation_runs` + alternatives). BQ8 counts a run only when an impression/selection event exists. | Two runs persist; they do not change BQ8 because no events were sent. |
| Refresh-token reuse | A superseded token is rejected with `401 INVALID_REFRESH_TOKEN` and the session is **not** revoked (compare-and-swap; only logout revokes). | Reuse test was safe and confined to the smoke account. |
| Access token after logout | Access tokens are stateless (no session id); the strategy checks only signature, expiry, user existence and `active`. | Expected to stay valid until its 15-minute expiry. |
| Inventory delete | `DELETE` is a soft delete (`active = false`). Reads and writes are scoped by owner. | Smoke items remain as inactive rows. Cross-account attempts should return 404. |
| Analytics rejection paths | Global `ValidationPipe` and the JWT guard reject before the handler runs. | Invalid/unauthenticated analytics requests were safe to test. |

## 3. Results executed against Render

All times are 2026-10-27; UTC / Bogotá (UTC−5). "ms" is client-measured response time.
Actors: *anonymous*, *demo USER* and *demo ANALYST* (seeded accounts from `.env.render`), and
*smoke* (the dedicated account registered in this run). No passwords, tokens or Authorization
headers are recorded.

### 3.1 Availability, documentation, base URLs

| ID | Time UTC / Bogotá | Actor | Request | Expected | Actual | Verdict |
|---|---|---|---|---|---|---|
| AV-1 | 15:55:38 / 10:55:38 | anonymous | `GET /api/v1/health` | 200 `{status:ok, database:up, timestamp}` | 200, 410 ms, JSON, `status=ok database=up`, first attempt (service was already awake; no cold start observed) | PASS |
| DOC-1 | 15:55:39 / 10:55:39 | anonymous | `GET /api/docs` | 200 HTML Swagger UI | 200, 167 ms, `text/html`, Swagger UI | PASS |
| DOC-2 | 15:55:39 / 10:55:39 | anonymous | `GET /api/docs-json` (`SwaggerModule.setup('api/docs')` default `<path>-json`) | 200 OpenAPI document | 200, 139 ms, OpenAPI 3.0.0, "CampusMeal API" v1.0, 16 paths. All `/api/v1` paths exercised below are present; no `/recipes` path exists. | PASS |
| BASE-1 | 15:55:39 / 10:55:39 | anonymous | `GET /` | structured 404 | 404, 160 ms, `code=NOT_FOUND`, full error shape `{statusCode, code, message, timestamp, path}` | PASS |
| BASE-2 | 15:55:39 / 10:55:39 | anonymous | `GET /api/v1/` | structured 404 | 404, 110 ms, `code=NOT_FOUND`, full error shape. Expected: no root handler. The Android base URL stays `…/api/v1/`. | PASS |
| AV-2 | 15:55:53 / 10:55:53 | anonymous | `GET /api/v1/health` (end of run) | 200 ok/up | 200, 123 ms, `status=ok database=up` | PASS |

### 3.2 Authentication and roles (demo accounts)

| ID | Time UTC / Bogotá | Actor | Request | Expected | Actual | Verdict |
|---|---|---|---|---|---|---|
| AUTH-1 | 15:55:39 / 10:55:39 | anonymous | `GET /api/v1/auth/me`, no token | 401 `INVALID_ACCESS_TOKEN` | 401, 97 ms, `INVALID_ACCESS_TOKEN`, full error shape | PASS |
| AUTH-2 | 15:55:39 / 10:55:39 | demo USER | `POST /api/v1/auth/login` | 200 `{accessToken, refreshToken}` | 200, 1955 ms (argon2 verify), exactly those two keys, both JWT-shaped | PASS |
| AUTH-3 | 15:55:41 / 10:55:41 | demo USER | `GET /api/v1/auth/me` | 200, `role=USER`, configured email | 200, 110 ms, keys `id,name,email,role`, `role=USER`, email matches | PASS |
| AUTH-4 | 15:55:41 / 10:55:41 | demo ANALYST | `POST /api/v1/auth/login` | 200 token pair | 200, 1573 ms, JWT-shaped pair | PASS |
| AUTH-5 | 15:55:43 / 10:55:43 | demo ANALYST | `GET /api/v1/auth/me` | 200, `role=ANALYST` | 200, 123 ms, `role=ANALYST`, email matches | PASS |

### 3.3 Database-backed reads

| ID | Time UTC / Bogotá | Actor | Request | Expected | Actual | Verdict |
|---|---|---|---|---|---|---|
| INV-1 | 15:55:43 / 10:55:43 | demo USER | `GET /api/v1/inventory` | 200 `{items[]}` with `remainingDays` | 200, 148 ms; 5 active items: Bread (−1 d), Yogurt (0), Whole milk (1), Spinach (3), Rice (30); item keys `id,name,quantity,unit,expirationDate,remainingDays,active`. The expired item is listed, as the contract specifies; the inactive Cheese item is excluded. | PASS |
| INV-2 | 15:55:43 / 10:55:43 | demo USER | `GET /api/v1/inventory/expiring?withinDays=3` | 200, 0 ≤ remainingDays ≤ 3, ascending | 200, 127 ms; Yogurt (0), Whole milk (1), Spinach (3), in order. This matches the seed today, but demo dates age, so the result will drift unless the inventory seed is re-run. | PASS |
| RES-1 | 15:55:43 / 10:55:43 | demo USER | `POST /api/v1/restaurants/search` `{location: 4.6025,-74.0653 (API contract example), availableMinutes:60, maximumBudget:30000, dietaryPreferences:[], includeDelivery:true, requestedAt: now}` | 200 `{restaurants[], lastUpdatedAt, routeProviderStatus}` | 200, 836 ms; 2 results, both `OPEN` (Tuesday 10:55 Bogotá: only weekday-morning restaurants are open); `walkingMinutes` 3 and 4; `routeProviderStatus=AVAILABLE` | PASS |
| RES-2 | 15:55:44 / 10:55:44 | demo USER | `GET /api/v1/restaurants/{id returned by RES-1}` | 200 `{restaurant, address, meals[], lastUpdatedAt, routeProviderStatus}` | 200, 149 ms; "Green Bowl", 2 meals; `routeProviderStatus=UNAVAILABLE`, `walkingMinutes=null`. Expected: the detail request has no origin, so the service never calls the provider. | PASS |

### 3.4 Analyst permissions and reports

| ID | Time UTC / Bogotá | Actor | Request | Expected | Actual | Verdict |
|---|---|---|---|---|---|---|
| PERM-1 | 15:55:44 / 10:55:44 | demo USER | `GET /api/v1/analytics/feature-adoption?month=2026-09` | 403 `FORBIDDEN` | 403, 130 ms, `FORBIDDEN`, full error shape | PASS |
| PERM-2 | 15:55:44 / 10:55:44 | demo USER | `GET /api/v1/analytics/explanation-selection?from=2026-10-01&to=2026-10-27` | 403 `FORBIDDEN` | 403, 119 ms, `FORBIDDEN` | PASS |
| BQ6-1 | 15:55:45 / 10:55:45 | demo ANALYST | `GET …/feature-adoption?month=2026-09` (`USAGE_SEED_MONTH` empty → seed default "previous month", assumed seeded in October) | 200, full report shape | 200, 168 ms; `status=OK`, `monthlyActiveUsers=10`, `eventsReceived=62`, `partialMonth=false`, `includesSyntheticData=true`. Low-use rates: RECIPES 10/10 = 1.0 (flagged), MEAL_COMPARISON 8/10 = 0.8 (flagged), INVENTORY 0.7, RESTAURANT_DETAIL 0.5, RESTAURANT_SEARCH 0. Exactly the outcome documented in `usage.seed.ts`. The figures are synthetic, not real student adoption. | PASS |
| BQ6-2 | 15:55:45 / 10:55:45 | demo ANALYST | `GET …/feature-adoption?month=2026-10` | 200; empty month is valid | 200, 114 ms; `status=NO_DATA`, `MAU=0`, `events=0`, `partialMonth=true`, `results=[]` | PASS |
| BQ8-1 | 15:55:45 / 10:55:45 | demo ANALYST | `GET …/explanation-selection?from=2026-10-01&to=2026-10-27` | 200 `{from, to, results[]}` | 200, 154 ms; `results=[]` (no impression/selection events in October). The contract exposes no sample-size or synthetic flag for BQ8. | PASS |

### 3.5 Isolated writable flow (dedicated smoke account)

Run marker `smoke-20261027T1555-3a42b4`. The account was registered with the synthetic address
`smoke-20261027T1555-3a42b4@campusmeal.local` (reserved `.local` domain, no mailbox) and a
password generated in memory. The API stores the address lowercased.

| ID | Time UTC / Bogotá | Actor | Request | Expected | Actual | Verdict |
|---|---|---|---|---|---|---|
| FLOW-1 | 15:55:45 / 10:55:45 | smoke | `POST /api/v1/auth/register` `{fullName:"Smoke Test <marker>", email, password}` | 201 token pair (session R) | 201, 1647 ms, JWT-shaped pair | PASS |
| FLOW-2 | 15:55:47 / 10:55:47 | smoke | `POST /api/v1/auth/login` | 200 (session A) | 200, 1489 ms | PASS |
| FLOW-3 | 15:55:48 / 10:55:48 | smoke | `GET /api/v1/auth/me` | 200 `role=USER`, same email | 200, 132 ms, `role=USER`, account id `fbd00e1d-7aa4-4b16-a047-b65068671d9c`. The runner compared the email case-sensitively against the mixed-case address it sent (`…T1555…`); the API lowercases emails by contract (`RegisterDto`: "Trimmed and lowercased"). Login with the same address (FLOW-2) and the duplicate check (REJ-6) behaved correctly. **Not an API defect.** The exact returned email was not saved, so this field is unverified. | FAIL (runner expectation) |
| FLOW-4 | 15:55:48 / 10:55:48 | smoke | `POST /api/v1/inventory` `{name:"<marker> milk", quantity:1, unit:"L", expirationDate:2026-10-28}` | 201 | 201, 125 ms, id `4ef3af44-64e9-4288-968e-32caf9c33bc5`, `remainingDays=1` | PASS |
| FLOW-5 | 15:55:48 / 10:55:48 | smoke | `POST /api/v1/inventory` `{name:"<marker> rice", quantity:500, unit:"g", expirationDate:2026-11-16}` | 201 | 201, 121 ms, id `07d003ef-0ab1-4d0a-9bae-95bc201a105a`, `remainingDays=20` | PASS |
| FLOW-6 | 15:55:49 / 10:55:49 | smoke | `GET /api/v1/inventory` | exactly the 2 created items | 200, 113 ms, 2 items, both ids present | PASS |
| FLOW-7 | 15:55:49 / 10:55:49 | smoke | `PATCH /api/v1/inventory/{milk}` `{quantity:2}` | 200, quantity 2, date unchanged | 200, 126 ms, `quantity=2`, `expirationDate=2026-10-28` | PASS |
| FLOW-8 | 15:55:49 / 10:55:49 | smoke | `GET /api/v1/inventory/expiring?withinDays=3` | only the milk (1 d) | 200, 115 ms, 1 item, `remainingDays=1` | PASS |
| ISO-1 | 15:55:49 / 10:55:49 | demo USER | `PATCH /api/v1/inventory/{smoke milk}` `{quantity:2}` (same value, so even a wrongly accepted request would change nothing) | 404 `INVENTORY_ITEM_NOT_FOUND` | 404, 373 ms, `INVENTORY_ITEM_NOT_FOUND` | PASS |
| ISO-2 | 15:55:49 / 10:55:49 | demo USER | `GET /api/v1/inventory` | no smoke item ids | 200, 108 ms, 5 demo items, no smoke ids | PASS |
| CMP-1 | 15:55:49 / 10:55:49 | smoke | `POST /api/v1/meal-decisions/compare` `{campus location, availableMinutes:45, maximumBudget:25000, dietaryPreferences:[], includeDelivery:true, requestedAt: now}` | 200 `{recommendationId, alternatives ranked 1..n, mainExplanation, supportingReasons}` | 200, 490 ms, recommendation `eef53df5-b2e5-4bea-8fc2-c2646a54fb30`; 1 COOK (recommended, 20 min, $0, 1 expiring ingredient), 2 WALK (21 min, $17,000, walking 3 min), 3 ORDER (35 min, $21,500); explanation "Cooking is recommended because it is the cheapest option that fits your available time."; 1 supporting reason | PASS |
| CMP-2 | 15:55:50 / 10:55:50 | smoke | same endpoint `{availableMinutes:90, maximumBudget:15000, dietaryPreferences:[VEGETARIAN], includeDelivery:false, requestedAt: 2026-10-27T17:30:00Z}` | 200, same contract | 200, 316 ms, recommendation `9bab04d1-7395-446e-aa73-05d6d440bf5c`; 1 COOK (recommended), 2 WALK ($14,500, walking 2 min); no ORDER (delivery excluded); 2 supporting reasons | PASS |
| TOK-1 | 15:55:52 / 10:55:52 | smoke | `POST /api/v1/auth/refresh` (session R token) | 200 new pair, different refresh token | 200, 118 ms, new refresh token differs | PASS |
| TOK-2 | 15:55:52 / 10:55:52 | smoke | `POST /api/v1/auth/refresh` (superseded R token again) | 401 `INVALID_REFRESH_TOKEN` | 401, 102 ms, `INVALID_REFRESH_TOKEN` | PASS |
| TOK-3 | 15:55:52 / 10:55:52 | smoke | `POST /api/v1/auth/refresh` (current R token) | 200; reuse did not revoke the session | 200, 116 ms, rotated again | PASS |
| CLN-1 | 15:55:53 / 10:55:53 | smoke | `DELETE /api/v1/inventory/{milk}` | 204 | 204, 104 ms | PASS |
| CLN-2 | 15:55:53 / 10:55:53 | smoke | `DELETE /api/v1/inventory/{rice}` | 204 | 204, 243 ms | PASS |
| CLN-3 | 15:55:53 / 10:55:53 | smoke | `GET /api/v1/inventory` | `items=[]` | 200, 96 ms, 0 items | PASS |
| TOK-4 | 15:55:53 / 10:55:53 | smoke | `POST /api/v1/auth/logout` (session R) | 204 | 204, 105 ms | PASS |
| TOK-5 | 15:55:53 / 10:55:53 | smoke | `POST /api/v1/auth/refresh` (logged-out token) | 401 `REFRESH_SESSION_REVOKED` | 401, 129 ms, `REFRESH_SESSION_REVOKED` | PASS |
| TOK-6 | 15:55:53 / 10:55:53 | smoke | `GET /api/v1/auth/me` with session R's last access token | 200 until expiry (stateless access tokens) | 200, 101 ms. Expected by design: logout ends the refresh session; an issued access token lives up to 15 minutes. | PASS |
| TOK-7 | 15:55:53 / 10:55:53 | smoke | `POST /api/v1/auth/logout` (session A) | 204 | 204, 98 ms | PASS |

### 3.6 Input rejection

| ID | Time UTC / Bogotá | Actor | Request | Expected | Actual | Verdict |
|---|---|---|---|---|---|---|
| REJ-1 | 15:55:48 / 10:55:48 | smoke | `POST /api/v1/inventory` `{quantity:-1, expirationDate:"2026-02-30"}` | 400 `VALIDATION_ERROR`, nothing created | 400, 167 ms, messages "quantity must not be less than 0; expirationDate must be a real calendar date…"; FLOW-6 confirmed only 2 items exist | PASS |
| REJ-2 | 15:55:50 / 10:55:50 | smoke | `POST /api/v1/analytics/usage-events` `{}` | 400 `VALIDATION_ERROR` (before persistence) | 400, 111 ms, `VALIDATION_ERROR` | PASS |
| REJ-3 | 15:55:50 / 10:55:50 | anonymous | `POST /api/v1/analytics/events` `{}`, no token | 401 `INVALID_ACCESS_TOKEN` | 401, 107 ms | PASS |
| REJ-4 | 15:55:51 / 10:55:51 | smoke | `GET /api/v1/restaurants/00000000-0000-4000-8000-000000000000` | 404 | 404, 121 ms, `NOT_FOUND`, full error shape | PASS |
| REJ-5 | 15:55:51 / 10:55:51 | smoke | `POST /api/v1/auth/login`, wrong password (smoke account only) | 401 `INVALID_CREDENTIALS` | 401, 1469 ms, `INVALID_CREDENTIALS` | PASS |
| REJ-6 | 15:55:52 / 10:55:52 | smoke | `POST /api/v1/auth/register`, same email | 409 `EMAIL_ALREADY_REGISTERED` | 409, 97 ms | PASS |

## 4. External route provider

- RES-1 returned `routeProviderStatus=AVAILABLE` with walking times of 3 and 4 minutes. For Green
  Bowl, the restaurant then read in RES-2, the API reported 3 minutes. The local `deterministic`
  adapter formula (haversine distance ÷ 80 m/min, minimum 1) gives **1 minute** for that
  restaurant from the same origin (71 m straight line). The value therefore did not come from the
  deterministic fallback. That is consistent with the intended `ROUTE_PROVIDER_MODE=valhalla`
  in the team's private template.
- **Status: indirectly evidenced, not directly verified.** The API does not expose which adapter
  is active, Render's environment was not inspected, and the outbound Valhalla call itself was not
  observed. Valhalla availability over time (timeouts, rate limits → `UNAVAILABLE`/`PARTIAL`) was
  not exercised.

## 5. Test data created and residual records

| Record | Created | Cleanup | Residual |
|---|---|---|---|
| Smoke user `smoke-20261027t1555-3a42b4@campusmeal.local` (`fbd00e1d-7aa4-4b16-a047-b65068671d9c`, role USER, active) | FLOW-1 | No public account-deletion endpoint | **Remains.** It has no usage events, so it does not count as a BQ6 monthly active user. |
| 2 refresh sessions (R, A) | FLOW-1, FLOW-2 | Both logged out (TOK-4, TOK-7) | Revoked rows remain in `refresh_sessions` |
| Inventory `4ef3af44-64e9-4288-968e-32caf9c33bc5` (milk), `07d003ef-0ab1-4d0a-9bae-95bc201a105a` (rice) | FLOW-4/5 | Deleted via API (soft delete), confirmed by CLN-3 | Inactive rows remain; invisible through the API |
| Recommendation runs `eef53df5-b2e5-4bea-8fc2-c2646a54fb30`, `9bab04d1-7395-446e-aa73-05d6d440bf5c` | CMP-1/2 | No public delete endpoint | **Remain.** They have no impression/selection events, so BQ8 does not count them. |
| Analytics / usage events | None | — | None |
| Demo data | Read only | — | Unchanged (ISO-1 was a rejected no-op) |

No ambiguous write outcomes: every write returned a definitive status, and none was retried. To
remove the residual rows later, the team would need a deliberate database task (out of scope
here; nothing was done to Neon directly).

## 6. Diagnosis

No API failure was observed. The one FAIL (FLOW-3) is a runner expectation error: it compared
the returned email case-sensitively although the contract lowercases emails. No source fix is
needed, and none awaits publication.

Observations, not defects:

- Login/register take about 1.5–2 s, because of argon2 hashing on the Free instance. Other calls
  take roughly 100–850 ms from Bogotá.
- The service was already awake (health 410 ms), so no cold start was measured in this run.
- Demo inventory expirations are relative to the seeding date; INV-2's three-item answer will
  change as days pass.

## 7. Not established by this HTTP smoke run

- Android APK installation and HTTPS configuration on a physical device.
- Login and the existing flows through the real mobile UI over mobile data.
- Android offline cache, account-generation isolation, process-death recovery and WorkManager
  behavior.
- Actual access-token expiry (15 min). It was not waited for, and TTLs were not shortened.
- Cold start after ≥ 15 minutes of inactivity, restart/redeploy persistence on Render, and Neon
  resume latency.
- Direct verification of the Valhalla call and its behavior when unavailable.
- Valid analytics ingestion and deduplication (`/analytics/events`, `/analytics/usage-events`),
  deliberately excluded to keep the team's analytics untouched.
- Which commit is deployed (no build metadata exposed).
