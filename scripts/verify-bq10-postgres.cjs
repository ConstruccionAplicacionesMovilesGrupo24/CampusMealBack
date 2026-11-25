// Runs the actual SupplyGapService SQL on PostgreSQL using connection-local temporary tables.
// No persistent catalog or usage rows are inserted, updated or deleted. Run after migration.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const ds = require('../dist/database/data-source').default;
const { SupplyGapService } = require('../dist/analytics/supply-gap.service');
const date = '2026-11-17';
const zone = 'bogota-centro';
const hours = Array.from({ length: 7 }, (_, dayOfWeek) => [
  { dayOfWeek, opensAt: '00:00', closesAt: '12:00' },
  { dayOfWeek, opensAt: '12:00', closesAt: '00:00' },
]).flat();
const ids = Array.from({ length: 5 }, () => randomUUID());

async function main() {
  await ds.initialize();
  const runner = ds.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    // Copy referenced column types only. Foreign keys and constraints are tested by migration/seed, not here.
    await runner.query(
      'CREATE TEMP TABLE restaurants ON COMMIT DROP AS SELECT id, analytics_zone, active, opening_hours FROM public.restaurants WITH NO DATA',
    );
    await runner.query(
      'CREATE TEMP TABLE meals ON COMMIT DROP AS SELECT id, restaurant_id, available, meal_category FROM public.meals WITH NO DATA',
    );
    await runner.query(
      'CREATE TEMP TABLE usage_events ON COMMIT DROP AS SELECT user_id, event_type, feature, zone_id, food_category, synthetic, occurred_at FROM public.usage_events WITH NO DATA',
    );
    await runner.query('SET LOCAL search_path TO pg_temp, public');
    for (const name of ['restaurants', 'meals', 'usage_events']) {
      const [check] = await runner.query(
        'SELECT to_regclass($1) = to_regclass($2) AS ok',
        [name, `pg_temp.${name}`],
      );
      assert.equal(check.ok, true, `Unsafe search path for ${name}`);
    }
    async function restaurant(
      category,
      { active = true, open = true, available = true, z = zone } = {},
    ) {
      const id = randomUUID();
      await runner.query(
        'INSERT INTO pg_temp.restaurants (id, analytics_zone, active, opening_hours) VALUES ($1,$2,$3,$4)',
        [id, z, active, JSON.stringify(open ? hours : [])],
      );
      await runner.query(
        'INSERT INTO pg_temp.meals (id, restaurant_id, available, meal_category) VALUES ($1,$2,$3,$4)',
        [randomUUID(), id, available, category],
      );
      return id;
    }
    async function event(
      category,
      user,
      {
        day = date,
        feature = 'RESTAURANT_SEARCH',
        synthetic = true,
        z = zone,
        time = '12:00:00-05:00',
      } = {},
    ) {
      await runner.query(
        "INSERT INTO pg_temp.usage_events (user_id,event_type,feature,zone_id,food_category,synthetic,occurred_at) VALUES ($1,'FEATURE_USED',$2,$3,$4,$5,$6)",
        [user, feature, z, category, synthetic, `${day}T${time}`],
      );
    }
    for (const id of ids) {
      await event('SUSHI', id, { time: '00:00:00-05:00' });
      await event('SOUPS', id);
      for (let n = 0; n < 3; n++) await event('BOWLS', id);
    }
    for (const id of ids.slice(0, 4))
      await event('SUSHI', id, { day: '2026-11-18', time: '00:00:00-05:00' });
    for (const id of ids) await event('BOWLS', id, { day: '2026-11-18' });
    for (const id of ids) await event('SUSHI', id, { z: 'bogota-chapinero' });
    await event('SUSHI', ids[0], { feature: 'RESTAURANT_DETAIL' });
    await event('SUSHI', ids[0], { synthetic: false });
    await event(null, ids[0]);
    await restaurant('SUSHI');
    await restaurant('BOWLS');
    await restaurant('BOWLS');
    await restaurant('SUSHI', { active: false });
    await restaurant('SUSHI', { open: false });
    await restaurant('SUSHI', { available: false });
    const service = new SupplyGapService({
      query: (sql, params) => runner.query(sql, params),
    });
    const report = (day = date, z = zone, dataset = 'SYNTHETIC') =>
      service.report({ zone: z, from: day, to: day, dataset });
    const row = (r, c) => r.rows.find((x) => x.category === c);
    const first = await report();
    assert.equal(first.categorizedSearchIntents, 25);
    assert.equal(row(first, 'SUSHI').distinctSearchers, 5);
    assert.equal(row(first, 'SUSHI').demandShare, 0.2);
    assert.equal(row(first, 'SUSHI').availableRestaurants, 1);
    assert.equal(row(first, 'SUSHI').status, 'GAP');
    assert.equal(row(first, 'SOUPS').availableRestaurants, 0);
    assert.equal(row(first, 'SOUPS').status, 'GAP');
    assert.equal(row(first, 'BOWLS').availableRestaurants, 2);
    assert.equal(row(first, 'BOWLS').status, 'NO_GAP');
    assert.equal(row(first, 'SALADS').status, 'NO_OBSERVATIONS');
    console.log(
      'PASS: SQL date boundaries, dataset, event type and category filters; threshold, one/zero/two supply and absent category',
    );
    const sparse = await report('2026-11-18');
    assert.equal(sparse.categorizedSearchIntents, null);
    assert.ok(
      sparse.rows.every(
        (r) =>
          r.status === 'SUPPRESSED' &&
          r.searchIntents === null &&
          r.demandShare === null,
      ),
    );
    assert.equal(
      row(await report(date, 'bogota-chapinero'), 'SUSHI').status,
      'UNKNOWN_SUPPLY',
    );
    assert.equal(
      row(await report(date, zone, 'REAL'), 'SUSHI').status,
      'SUPPRESSED',
    );
    console.log(
      'PASS: complementary suppression, unknown coverage and separate real dataset',
    );
    await restaurant('SUSHI');
    const second = await report();
    assert.equal(
      second.categorizedSearchIntents,
      first.categorizedSearchIntents,
    );
    assert.equal(row(second, 'SUSHI').status, 'NO_GAP');
    assert.equal(row(second, 'SUSHI').availableRestaurants, 2);
    console.log(
      'PASS: current supply can change classification without altering historical demand',
    );
  } finally {
    try {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
    } finally {
      try {
        await runner.release();
      } finally {
        await ds.destroy();
      }
    }
  }
  console.log('BQ10 PostgreSQL verification passed; transaction rolled back.');
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
