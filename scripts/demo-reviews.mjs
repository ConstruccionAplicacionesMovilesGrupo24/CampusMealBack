// Sprint 4 / S4-03: visible demo reviews through the public API.
//
// The public summary of GET /restaurants/:id/reviews is suppressed below 5 distinct real reviewers, and
// seed:bq13 rows are synthetic (hidden by default). To show reviews to any account in the app, this script
// registers 6 clearly named demo accounts (demo-reviewer-01..06@campusmeal.local) and posts one review per
// account and active restaurant through POST /restaurants/:id/reviews, like the app would.
//
// These rows are NOT synthetic: they count as student self-reports in BQ13 real-only reports. Remove them by
// deleting the demo-reviewer-* users (reviews cascade).
//
// Idempotent: stable clientReviewIds and fixed dates anchored at DEMO_REVIEWS_DATE (default 2026-11-24), so a
// re-run answers 200 (replay). The API accepts occurredAt up to 30 days old; after that, move the anchor.
//
//   API_URL=https://campusmeal-api.onrender.com/api/v1 PASSWORD=… ANALYST_PASSWORD=… node scripts/demo-reviews.mjs
import { createHash } from 'node:crypto';

const B = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const PASSWORD = process.env.PASSWORD;
const ANALYST_PASSWORD = process.env.ANALYST_PASSWORD ?? PASSWORD;
const ANCHOR = process.env.DEMO_REVIEWS_DATE ?? '2026-11-24';
if (!PASSWORD)
  throw new Error('set PASSWORD (used for the demo-reviewer accounts)');

const REVIEWERS = 6;
// [overall, portion, taste, freshness, value, waitMinutes] per reviewer, by restaurant name.
const PROFILES = {
  'Green Bowl': [
    [5, 4, 5, 5, 4, 8],
    [4, 4, 4, 5, 4, 10],
    [5, 5, 5, 4, 4, 6],
    [4, 3, 4, 4, 3, 12],
    [5, 4, 5, 5, 5, 7],
    [4, 4, 4, 4, 4, 9],
  ],
  'The Garden': [
    [4, 4, 4, 3, 4, 14],
    [3, 4, 3, 3, 4, 18],
    [4, 5, 4, 4, 5, 12],
    [4, 4, 4, 4, 4, 15],
    [3, 3, 3, 3, 3, 20],
    [4, 4, 5, 4, 4, 13],
  ],
  'Andean Flavor': [
    [5, 5, 5, 4, 5, 20],
    [4, 5, 4, 4, 5, 25],
    [5, 5, 5, 5, 4, 18],
    [4, 5, 4, 3, 4, 30],
    [5, 5, 4, 4, 5, 22],
    [4, 4, 4, 4, 4, 24],
  ],
  'Sushi Rápido': [
    [3, 2, 4, 4, 2, 6],
    [4, 3, 4, 4, 3, 5],
    [3, 2, 3, 4, 2, 8],
    [4, 3, 5, 5, 3, 4],
    [3, 3, 3, 3, 2, 7],
    [3, 2, 4, 4, 3, 6],
  ],
  'Quinoa Corner': [
    [4, 4, 4, 4, 5, 10],
    [3, 4, 3, 4, 4, 12],
    [4, 4, 4, 5, 5, 9],
    [4, 3, 4, 4, 4, 11],
    [3, 3, 3, 4, 4, 15],
    [4, 4, 4, 4, 5, 10],
  ],
};
const DEFAULT_PROFILE = [
  [4, 4, 4, 4, 4, 12],
  [4, 3, 4, 4, 4, 15],
  [3, 4, 3, 4, 3, 10],
  [4, 4, 4, 3, 4, 14],
  [5, 4, 4, 4, 4, 9],
  [4, 4, 4, 4, 3, 11],
];

/** Stable UUID (v5 layout) from a string, so re-runs replay instead of duplicating. */
const stableUuid = (seed) => {
  const h = createHash('sha1')
    .update(seed)
    .digest('hex')
    .slice(0, 32)
    .split('');
  h[12] = '5';
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};

/** Lunchtime in Bogotá (UTC-5) `daysBefore` days before the anchor. */
const occurredAt = (daysBefore, minute) => {
  const [y, m, d] = ANCHOR.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - daysBefore, 17, minute))
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
};

const request = async (method, path, body, token) => {
  const res = await fetch(`${B}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const login = async (email, password) => {
  const r = await request('POST', '/auth/login', { email, password });
  if (r.status !== 200)
    throw new Error(`login ${email}: HTTP ${r.status} ${r.body?.code ?? ''}`);
  return r.body.accessToken;
};

const analyst = await login('analyst@campusmeal.local', ANALYST_PASSWORD);
const report = await request(
  'GET',
  `/analytics/partner-health?from=${ANCHOR}&to=${ANCHOR}`,
  null,
  analyst,
);
if (report.status !== 200)
  throw new Error(`partner-health: HTTP ${report.status}`);
const restaurants = report.body.restaurants.map((r) => ({
  id: r.restaurantId,
  name: r.name,
}));
console.log(`restaurants: ${restaurants.map((r) => r.name).join(', ')}`);

const tally = {};
for (let i = 1; i <= REVIEWERS; i++) {
  const email = `demo-reviewer-${String(i).padStart(2, '0')}@campusmeal.local`;
  const reg = await request('POST', '/auth/register', {
    fullName: `Demo reviewer ${i}`,
    email,
    password: PASSWORD,
  });
  const token =
    reg.status === 201 && reg.body?.accessToken
      ? reg.body.accessToken
      : await login(email, PASSWORD);
  const statuses = [];
  for (const [j, r] of restaurants.entries()) {
    const [overall, portion, taste, freshness, value, waitMinutes] = (PROFILES[
      r.name
    ] ?? DEFAULT_PROFILE)[i - 1];
    const res = await request(
      'POST',
      `/restaurants/${r.id}/reviews`,
      {
        clientReviewId: stableUuid(`demo-review:${email}:${r.id}`),
        overall,
        portion,
        taste,
        freshness,
        value,
        waitMinutes,
        occurredAt: occurredAt(((i * 2 + j) % 10) + 1, (i * 7 + j * 5) % 60),
      },
      token,
    );
    statuses.push(res.status === 409 ? `409 ${res.body.code}` : res.status);
    tally[res.status] = (tally[res.status] ?? 0) + 1;
  }
  console.log(`${email} (register ${reg.status}): ${statuses.join(' ')}`);
}
console.log(`totals by HTTP status: ${JSON.stringify(tally)}`);

const user = await login('demo-reviewer-01@campusmeal.local', PASSWORD);
for (const r of restaurants) {
  const s = (
    await request('GET', `/restaurants/${r.id}/reviews?limit=3`, null, user)
  ).body.summary;
  console.log(
    `${r.name}: suppressed=${s.suppressed} reviews=${s.reviewCount} reviewers=${s.distinctReviewers} overall=${s.meanOverall} wait=${s.meanWaitMinutes}`,
  );
}
