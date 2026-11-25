const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateSupplyGaps } = require('../dist/analytics/supply-gap.service');
const {
  MealCategory: C,
} = require('../dist/restaurants/enums/meal-category.enum');
const { GapStatus: S } = require('../dist/analytics/dto/supply-gap.dto');
const {
  AnalyticsZone: Z,
} = require('../dist/analytics/enums/analytics-zone.enum');
const {
  RestaurantsService,
} = require('../dist/restaurants/restaurants.service');
const {
  AlternativesStatus: A,
} = require('../dist/restaurants/dto/alternative-meals.dto');
const {
  RouteProviderStatus: R,
} = require('../dist/routes/domain/route-provider.port');
const zone = Z.BOGOTA_CENTRO;
const instant = new Date('2026-11-25T17:00:00Z');
const hours = Array.from({ length: 7 }, (_, dayOfWeek) => [
  { dayOfWeek, opensAt: '00:00', closesAt: '12:00' },
  { dayOfWeek, opensAt: '12:00', closesAt: '00:00' },
]).flat();
const catalog = (id, category, other = {}) => ({
  restaurant_id: id,
  zone,
  active: true,
  opening_hours: hours,
  meal_id: `${id}-${category}`,
  meal_category: category,
  ...other,
});
const demand = [
  { category: null, intents: 25, searchers: 10 },
  { category: C.SUSHI, intents: 5, searchers: 5 },
  { category: C.BOWLS, intents: 20, searchers: 10 },
];
const row = (d, c, category = C.SUSHI) =>
  calculateSupplyGaps(d, c, zone, instant).rows.find(
    (r) => r.category === category,
  );
test('exact thresholds: 5 users and 20%, one available restaurant is a gap', () => {
  const r = row(demand, [
    catalog('1', C.SUSHI),
    catalog('1', C.SUSHI, { meal_id: 'other' }),
    catalog('2', C.BOWLS),
  ]);
  assert.equal(r.demandShare, 0.2);
  assert.equal(r.availableRestaurants, 1);
  assert.equal(r.status, S.GAP);
});
test('two distinct open restaurants remove the gap; inactive and closed do not count', () => {
  assert.equal(
    row(demand, [catalog('1', C.SUSHI), catalog('2', C.SUSHI)]).status,
    S.NO_GAP,
  );
  assert.equal(
    row(demand, [
      catalog('1', C.SUSHI),
      catalog('2', C.SUSHI, { active: false }),
      catalog('3', C.SUSHI, { opening_hours: [] }),
    ]).availableRestaurants,
    1,
  );
});
test('mapped catalog with zero supply versus missing coverage', () => {
  assert.equal(row(demand, [catalog('1', C.BOWLS)]).availableRestaurants, 0);
  assert.equal(row(demand, []).status, S.UNKNOWN_SUPPLY);
  assert.equal(
    row(demand, [catalog('1', C.BOWLS), catalog('2', C.SUSHI, { zone: null })])
      .availableRestaurants,
    null,
  );
});
test('sparse category suppresses entire partition and denominator', () => {
  const result = calculateSupplyGaps(
    [demand[0], { ...demand[1], searchers: 4 }, demand[2]],
    [catalog('1', C.SUSHI)],
    zone,
    instant,
  );
  assert.equal(result.categorizedSearchIntents, null);
  for (const r of result.rows) {
    assert.equal(r.searchIntents, null);
    assert.equal(r.demandShare, null);
    assert.equal(r.status, S.SUPPRESSED);
  }
});
test('missing category and empty demand never create a gap', () => {
  assert.equal(
    row(demand, [catalog('1', C.SUSHI)], C.SALADS).status,
    S.NO_OBSERVATIONS,
  );
  assert.equal(
    row([{ category: null, intents: 0, searchers: 0 }], [catalog('1', C.SUSHI)])
      .status,
    S.NO_OBSERVATIONS,
  );
});
const restaurant = {
  id: 'r',
  name: 'Example',
  category: 'Healthy',
  active: true,
  openingHours: hours,
  latitude: 4.6,
  longitude: -74.0,
  averageRating: 4,
};
const meal = {
  id: 'm',
  restaurantId: 'r',
  name: 'Bowl',
  mealCategory: C.BOWLS,
  price: 12000,
  dietaryTags: ['VEGETARIAN'],
  available: true,
};
const dto = {
  foodCategory: C.SUSHI,
  location: { latitude: 4.6, longitude: -74.0 },
  availableMinutes: 40,
  maximumBudget: 15000,
  dietaryPreferences: ['VEGETARIAN'],
  includeDelivery: false,
  requestedAt: instant.toISOString(),
};
const service = (minutes, meals = [meal]) =>
  new RestaurantsService(
    { find: async () => [restaurant] },
    { find: async () => meals },
    {
      getWalkingTimes: async () => ({
        status: minutes === null ? R.UNAVAILABLE : R.AVAILABLE,
        estimates: [{ walkingMinutes: minutes }],
      }),
    },
  );
// The production method uses current server time; use an all-day opening fixture.
test('alternative preserves budget, diet, category and time', async () => {
  const s = service(5, [
    meal,
    { ...meal, id: 'expensive', price: 20000 },
    { ...meal, id: 'wrong-diet', dietaryTags: [] },
    { ...meal, id: 'original', mealCategory: C.SUSHI },
  ]);
  const r = await s.alternatives(dto);
  assert.equal(r.status, A.FOUND);
  assert.deepEqual(
    r.alternatives.map((x) => x.meal.id),
    ['m'],
  );
  assert.equal(r.alternatives[0].restaurant.estimatedTotalMinutes, 25);
});
test('no route estimate and too little time do not create eligible alternatives', async () => {
  const missing = await service(null).alternatives(dto);
  assert.equal(missing.status, A.REACHABILITY_UNCONFIRMED);
  assert.deepEqual(missing.alternatives, []);
  const slow = await service(30).alternatives(dto);
  assert.equal(slow.status, A.NO_COMPATIBLE_ALTERNATIVE);
  assert.deepEqual(slow.alternatives, []);
});
