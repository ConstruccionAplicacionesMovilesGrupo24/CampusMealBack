# Sprint 3 / BQ9: Zone demand analytics

## Endpoint

GET /api/v1/analytics/zone-demand?from=YYYY-MM-DD&to=YYYY-MM-DD

Role: ANALYST
Timezone: America/Bogota
Privacy threshold: 5 distinct users per cell.

## Indicator definitions

- searches: explicit restaurant search interactions.
- detailOpenings: intentional restaurant-detail openings.
- selections: WALK or ORDER recommendation selections.
- distinctUsers: distinct accounts contributing to the aggregate.
- suppressed: true when fewer than 5 distinct users contribute to the cell.

These indicators represent user interest and not verified purchases.

## Reporting window

Example:

from: YYYY-MM-DD
to: YYYY-MM-DD
timezone: America/Bogota

The report uses occurredAt rather than receivedAt.

## Idempotency

Usage events use `clientEventId` as the idempotency key. Replaying the same event does not create another stored row because ingestion uses conflict-safe insertion.

The BQ9 synthetic seed is also idempotent. Its users, recommendation runs, alternatives, usage events, and selection events use deterministic identifiers and conflict-safe inserts, so executing the seed more than once does not increase the expected aggregate counts.

## Authorization and privacy

`GET /api/v1/analytics/zone-demand` is protected with the existing `ANALYST` role.

A regular `USER` receives HTTP 403.

The response contains aggregates only. It does not return user identifiers or precise GPS coordinates. Zones are coarse values such as `bogota-centro` and `bogota-chapinero`.

Cells with fewer than 5 distinct users are suppressed. Suppressed metrics return `null` rather than `0`, because insufficient data must not be interpreted as absence of demand.

## Synthetic verification dataset

Run:

```bash
npm run seed:bq9
```

The default verification date is:

```text
2026-10-30
```

It can be overridden with:

```text
BQ9_SEED_DATE=YYYY-MM-DD
```

The dataset is explicitly synthetic and uses inactive demo accounts. It contains:

- 2 zones: `bogota-centro` and `bogota-chapinero`
- 3 categories: `BOWLS`, `SUSHI`, and `SALADS`
- LOW, MEDIUM, and HIGH price/budget bands
- interactions at 12:00, 13:00, and 18:00 Bogotá time
- a deliberate tie between BOWLS and SUSHI
- cells with only 4 distinct users to verify privacy suppression

### Expected aggregate totals

| Zone | Searches | Detail openings | Selections | Distinct users |
|---|---:|---:|---:|---:|
| bogota-centro | 16 | 16 | 14 | 6 |
| bogota-chapinero | 14 | 14 | 14 | 5 |

### Expected category verification

For each zone:

| Category | Expected |
|---|---|
| BOWLS | 5 selections, visible |
| SUSHI | 5 selections, visible |
| SALADS | suppressed because only 4 distinct users contributed |

BOWLS and SUSHI therefore provide the explicit ranking tie required by the acceptance case.

### Expected hourly verification

For `bogota-centro`:

| Hour | Searches | Detail openings | Selections |
|---|---:|---:|---:|
| 12:00 | 6 | 6 | 5 |
| 13:00 | 6 | 6 | 5 |
| 18:00 | suppressed | suppressed | suppressed |

For `bogota-chapinero`:

| Hour | Searches | Detail openings | Selections |
|---|---:|---:|---:|
| 12:00 | 5 | 5 | 5 |
| 13:00 | 5 | 5 | 5 |
| 18:00 | suppressed | suppressed | suppressed |

LOW and MEDIUM price/budget cells meet the five-user publication threshold. HIGH uses four distinct users and is intentionally suppressed.

## Verification request

After applying migrations and running the seed, query:

```text
GET /api/v1/analytics/zone-demand?from=2026-10-30&to=2026-10-30
```

with an ANALYST access token.

The response must include:

- `contractVersion`
- reporting dates
- `timezone = America/Bogota`
- generation timestamp
- `minDistinctUsersPerCell = 5`
- `containsSyntheticData = true`
- `interpretation = INTEREST_INDICATORS_NOT_VERIFIED_PURCHASES`
- separate counts for searches, detail openings, and selections
- explicit suppression of cells below the privacy threshold

## Deployment verification

Verified against the deployed API at `https://campusmeal-api.onrender.com` using an `ANALYST` account and the synthetic dataset for `2026-10-30`.

Request:

```text
GET /api/v1/analytics/zone-demand?from=2026-10-30&to=2026-10-30
```

Observed:

- HTTP 200
- `contractVersion: 1`
- `timezone: America/Bogota`
- `containsSyntheticData: true`
- `minDistinctUsersPerCell: 5`
- `suppressedCells: 8`
- `interpretation: INTEREST_INDICATORS_NOT_VERIFIED_PURCHASES`
- `bogota-centro`: 16 searches, 16 detail openings, 14 selections, 6 distinct users
- `bogota-chapinero`: 14 searches, 14 detail openings, 14 selections, 5 distinct users
- BOWLS and SUSHI tied at 5 selections in both zones
- SALADS was suppressed because fewer than 5 distinct users contributed
- HIGH searched-budget and interaction-price cells were suppressed
- 18:00 cells were suppressed
- LOW and MEDIUM cells remained visible

The observed deployed results match the manually calculated expectations of the deterministic synthetic fixture.

For the deployed Neon database, the fixture was executed from the compiled production build with:

```bash
node --env-file=.env.render dist/database/seeds/bq9.seed.js
```

The deployment was then validated through the public Render API. No database credentials, JWT signing secrets, access tokens, or test passwords are stored in this document.