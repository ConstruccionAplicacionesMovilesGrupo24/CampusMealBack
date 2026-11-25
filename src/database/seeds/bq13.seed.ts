import 'reflect-metadata';
import { createHash, randomBytes } from 'crypto';
import { PasswordService } from '../../auth/password.service';
import { AnalyticsEvent } from '../../analytics/entities/analytics-event.entity';
import { AnalyticsEventType } from '../../analytics/enums/analytics-event-type.enum';
import { ClientPlatform } from '../../analytics/enums/client-platform.enum';
import {
  addCalendarDays,
  formatCalendarDate,
  parseCalendarDate,
} from '../../inventory/inventory-date';
import { RecommendationAlternative } from '../../recommendations/entities/recommendation-alternative.entity';
import { RecommendationRun } from '../../recommendations/entities/recommendation-run.entity';
import { MealAlternative } from '../../recommendations/enums/meal-alternative.enum';
import { Meal } from '../../restaurants/entities/meal.entity';
import { MenuRevision } from '../../restaurants/entities/menu-revision.entity';
import { Restaurant } from '../../restaurants/entities/restaurant.entity';
import { MenuChangeType } from '../../restaurants/enums/menu-change-type.enum';
import { MenuRevisionSource } from '../../restaurants/enums/menu-revision-source.enum';
import { RestaurantReview } from '../../reviews/entities/restaurant-review.entity';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import dataSource from '../data-source';

/**
 * Sprint 4 / S4-03: deterministic, clearly synthetic BQ13 dataset.
 *
 * Every row is marked synthetic (menu_revisions.source = SYNTHETIC_SEED, restaurant_reviews.synthetic,
 * recommendation_runs.synthetic) and only appears in reports with includeSynthetic=true.
 * Prerequisite: seed:restaurants (the five demo restaurants). Re-running it is a no-op.
 *
 * Anchor date D = BQ13_SEED_DATE (default 2026-11-20, America/Bogota). Two report windows:
 *   A = [D-6, D]   all five restaurants exposed to ≥5 users → association computed
 *   B = [D-13, D-7] sparse week → suppressed cells, zero exposures, INSUFFICIENT_DATA
 * Expected values: docs/SPRINT4_BQ13_REVIEWS.md §6.
 */
const SEED_DATE = process.env.BQ13_SEED_DATE ?? '2026-11-20';
const USERS = [0, 1, 2, 3, 4, 5, 6, 7];

const R1 = 'Green Bowl';
const R2 = 'The Garden';
const R3 = 'Andean Flavor';
const R4 = 'Sushi Rápido';
const R5 = 'Quinoa Corner';

/** Days before D of each synthetic menu revision. */
const REVISIONS: Record<string, number[]> = {
  [R1]: [1, 3, 5, 10],
  [R2]: [2],
  [R3]: [12],
  [R4]: [20],
  [R5]: [],
};

interface ExposureSpec {
  restaurant: string;
  daysBefore: number;
  exposed: number[];
  selecting: number[];
  /** Also offer the same restaurant as ORDER: still one exposure per recommendation. */
  sameRestaurantAsOrder: boolean;
}

const EXPOSURES: ExposureSpec[] = [
  // Window A
  {
    restaurant: R1,
    daysBefore: 2,
    exposed: USERS,
    selecting: [0, 1, 2, 3, 4, 5],
    sameRestaurantAsOrder: true,
  },
  {
    restaurant: R2,
    daysBefore: 2,
    exposed: [0, 1, 2, 3, 4, 5],
    selecting: [0, 1, 2],
    sameRestaurantAsOrder: false,
  },
  {
    restaurant: R3,
    daysBefore: 2,
    exposed: [0, 1, 2, 3, 4, 5],
    selecting: [0, 1],
    sameRestaurantAsOrder: false,
  },
  {
    restaurant: R4,
    daysBefore: 2,
    exposed: [0, 1, 2, 3, 4],
    selecting: [0],
    sameRestaurantAsOrder: false,
  },
  {
    restaurant: R5,
    daysBefore: 2,
    exposed: [0, 1, 2, 3, 4],
    selecting: [],
    sameRestaurantAsOrder: false,
  },
  // Window B (sparse)
  {
    restaurant: R1,
    daysBefore: 9,
    exposed: [0, 1, 2],
    selecting: [0],
    sameRestaurantAsOrder: false,
  },
];

interface ReviewSpec {
  restaurant: string;
  daysBefore: number;
  /** overall score per user index */
  overall: Record<number, number>;
}

const REVIEWS: ReviewSpec[] = [
  // Window A
  {
    restaurant: R1,
    daysBefore: 1,
    overall: { 0: 5, 1: 4, 2: 5, 3: 4, 4: 5, 5: 4 },
  },
  { restaurant: R2, daysBefore: 1, overall: { 0: 4, 1: 3, 2: 4, 3: 3, 4: 4 } },
  { restaurant: R3, daysBefore: 1, overall: { 0: 3, 1: 3, 2: 2 } },
  { restaurant: R5, daysBefore: 1, overall: { 0: 3, 1: 2, 2: 3, 3: 2, 4: 3 } },
  // Window B (sparse)
  { restaurant: R1, daysBefore: 9, overall: { 0: 4, 1: 5 } },
];

function day(daysBefore: number): string {
  const anchor = parseCalendarDate(SEED_DATE);
  if (!anchor) {
    throw new Error(`BQ13_SEED_DATE must be YYYY-MM-DD, got ${SEED_DATE}`);
  }
  return formatCalendarDate(addCalendarDays(anchor, -daysBefore));
}

/** Noon (or noon + minutes) in Bogotá (UTC-5, no daylight saving) of D - daysBefore. */
function instant(daysBefore: number, minutes = 0): Date {
  const time = `12:${String(minutes).padStart(2, '0')}:00-05:00`;
  return new Date(`${day(daysBefore)}T${time}`);
}

function stableId(key: string): string {
  const h = createHash('sha1')
    .update(`bq13-seed:${SEED_DATE}:${key}`)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function seed(): Promise<void> {
  await dataSource.initialize();
  try {
    const restaurants = new Map<string, Restaurant>();
    const firstMeal = new Map<string, Meal>();
    for (const name of [R1, R2, R3, R4, R5]) {
      const restaurant = await dataSource
        .getRepository(Restaurant)
        .findOneBy({ name });
      if (!restaurant) {
        throw new Error(
          `Restaurant "${name}" not found: run seed:restaurants first`,
        );
      }
      restaurants.set(name, restaurant);
      const meal = await dataSource.getRepository(Meal).findOne({
        where: { restaurantId: restaurant.id },
        order: { name: 'ASC' },
      });
      if (!meal) {
        throw new Error(`Restaurant "${name}" has no meals`);
      }
      firstMeal.set(name, meal);
    }

    const userRepository = dataSource.getRepository(User);
    const passwords = new PasswordService();
    const users: User[] = [];
    for (const index of USERS) {
      const email = `bq13-demo-${String(index).padStart(2, '0')}@campusmeal.local`;
      let user = await userRepository.findOneBy({ email });
      if (!user) {
        user = await userRepository.save(
          userRepository.create({
            name: `BQ13 Demo ${index}`,
            email,
            passwordHash: await passwords.hash(randomBytes(24).toString('hex')),
            role: UserRole.USER,
            active: false,
          }),
        );
      }
      users.push(user);
    }

    // 1. Synthetic menu revisions (no catalog value is changed).
    const revisionRows: QueryDeepPartialEntity<MenuRevision>[] = [];
    for (const [name, offsets] of Object.entries(REVISIONS)) {
      const meal = firstMeal.get(name)!;
      for (const daysBefore of offsets) {
        revisionRows.push({
          id: stableId(`revision:${name}:${daysBefore}`),
          restaurantId: restaurants.get(name)!.id,
          mealId: meal.id,
          mealName: meal.name,
          changeType: MenuChangeType.PRICE_CHANGED,
          previousValue: { price: meal.price - 1000 },
          newValue: { price: meal.price },
          changedAt: instant(daysBefore, 5),
          source: MenuRevisionSource.SYNTHETIC_SEED,
          note: 'Synthetic BQ13 fixture (no real menu change)',
        });
      }
    }
    if (revisionRows.length > 0) {
      await dataSource
        .createQueryBuilder()
        .insert()
        .into(MenuRevision)
        .values(revisionRows)
        .orIgnore()
        .execute();
    }

    // 2. Synthetic recommendations: impression for each exposed user, selection for selecting users.
    for (const [specIndex, spec] of EXPOSURES.entries()) {
      const restaurant = restaurants.get(spec.restaurant)!;
      const meal = firstMeal.get(spec.restaurant)!;
      const summary = {
        id: restaurant.id,
        name: restaurant.name,
        walkingMinutes: null,
        deliveryMinutes: null,
        deliveryFee: null,
      };
      for (const userIndex of spec.exposed) {
        const key = `${specIndex}:${userIndex}`;
        const runId = stableId(`run:${key}`);
        await dataSource
          .createQueryBuilder()
          .insert()
          .into(RecommendationRun)
          .values({
            id: runId,
            userId: users[userIndex].id,
            availableMinutes: 60,
            maximumBudget: 50_000,
            explanationType: null,
            mainExplanation: 'Synthetic BQ13 verification fixture',
            zone: null,
            synthetic: true,
          })
          .orIgnore()
          .execute();

        const alternatives: QueryDeepPartialEntity<RecommendationAlternative>[] =
          [
            {
              id: stableId(`alt-walk:${key}`),
              recommendationId: runId,
              type: MealAlternative.WALK,
              rank: 1,
              score: 80,
              recommended: true,
              estimatedMinutes: 25,
              estimatedCost: meal.price,
              metadata: {
                restaurant: summary,
                mealCategory: meal.mealCategory ?? undefined,
              },
            },
            {
              // COOK never counts as a restaurant exposure.
              id: stableId(`alt-cook:${key}`),
              recommendationId: runId,
              type: MealAlternative.COOK,
              rank: 3,
              score: 40,
              recommended: false,
              estimatedMinutes: 30,
              estimatedCost: 0,
              metadata: { expiringIngredients: [] },
            },
          ];
        if (spec.sameRestaurantAsOrder) {
          alternatives.push({
            id: stableId(`alt-order:${key}`),
            recommendationId: runId,
            type: MealAlternative.ORDER,
            rank: 2,
            score: 70,
            recommended: false,
            estimatedMinutes: 35,
            estimatedCost: meal.price + 3000,
            metadata: {
              restaurant: summary,
              mealCategory: meal.mealCategory ?? undefined,
            },
          });
        }
        await dataSource
          .createQueryBuilder()
          .insert()
          .into(RecommendationAlternative)
          .values(alternatives)
          .orIgnore()
          .execute();

        const events: QueryDeepPartialEntity<AnalyticsEvent>[] = [
          {
            clientEventId: stableId(`impression:${key}`),
            userId: users[userIndex].id,
            recommendationId: runId,
            eventType: AnalyticsEventType.RECOMMENDATION_IMPRESSION,
            selectedAlternative: null,
            platform: ClientPlatform.ANDROID,
            occurredAt: instant(spec.daysBefore, 0),
          },
        ];
        if (spec.selecting.includes(userIndex)) {
          events.push({
            clientEventId: stableId(`selection:${key}`),
            userId: users[userIndex].id,
            recommendationId: runId,
            eventType: AnalyticsEventType.RECOMMENDATION_SELECTED,
            selectedAlternative: MealAlternative.WALK,
            platform: ClientPlatform.ANDROID,
            occurredAt: instant(spec.daysBefore, 1),
          });
        }
        await dataSource
          .createQueryBuilder()
          .insert()
          .into(AnalyticsEvent)
          .values(events)
          .orIgnore()
          .execute();
      }
    }

    // 3. Synthetic structured reviews.
    const reviewRows: QueryDeepPartialEntity<RestaurantReview>[] = [];
    for (const spec of REVIEWS) {
      for (const [userIndex, overall] of Object.entries(spec.overall)) {
        reviewRows.push({
          clientReviewId: stableId(
            `review:${spec.restaurant}:${spec.daysBefore}:${userIndex}`,
          ),
          userId: users[Number(userIndex)].id,
          restaurantId: restaurants.get(spec.restaurant)!.id,
          overall,
          portion: overall,
          taste: overall,
          freshness: overall,
          value: overall,
          waitMinutes: 10,
          occurredAt: instant(spec.daysBefore, 30),
          reviewDate: day(spec.daysBefore),
          synthetic: true,
        });
      }
    }
    await dataSource
      .createQueryBuilder()
      .insert()
      .into(RestaurantReview)
      .values(reviewRows)
      .orIgnore()
      .execute();

    console.log(
      `[seed:bq13] Synthetic BQ13 dataset prepared with anchor ${SEED_DATE}.`,
    );
    console.log(
      `[seed:bq13] Window A: GET /api/v1/analytics/partner-health?from=${day(6)}&to=${day(0)}&includeSynthetic=true`,
    );
    console.log(
      `[seed:bq13] Window B: GET /api/v1/analytics/partner-health?from=${day(13)}&to=${day(7)}&includeSynthetic=true`,
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
