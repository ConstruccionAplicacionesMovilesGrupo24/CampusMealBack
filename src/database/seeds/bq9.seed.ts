import 'reflect-metadata';
import { createHash, randomBytes } from 'crypto';
import { PasswordService } from '../../auth/password.service';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import dataSource from '../data-source';
import { UsageEvent } from '../../analytics/entities/usage-event.entity';
import { AnalyticsEvent } from '../../analytics/entities/analytics-event.entity';
import { RecommendationRun } from '../../recommendations/entities/recommendation-run.entity';
import { RecommendationAlternative } from '../../recommendations/entities/recommendation-alternative.entity';

import { AnalyticsZone } from '../../analytics/enums/analytics-zone.enum';
import { BudgetBand } from '../../analytics/enums/budget-band.enum';
import { ClientPlatform } from '../../analytics/enums/client-platform.enum';
import { UsageEventType } from '../../analytics/enums/usage-event-type.enum';
import { UsageFeature } from '../../analytics/enums/usage-feature.enum';
import { AnalyticsEventType } from '../../analytics/enums/analytics-event-type.enum';
import { MealCategory } from '../../restaurants/enums/meal-category.enum';
import { MealAlternative } from '../../recommendations/enums/meal-alternative.enum';

const DEMO_USERS = [0, 1, 2, 3, 4, 5];

const SEED_DATE = process.env.BQ9_SEED_DATE ?? '2026-10-30';

function instant(hour: number): Date {
  return new Date(`${SEED_DATE}T${String(hour).padStart(2, '0')}:00:00-05:00`);
}

function eventId(key: string): string {
  const h = createHash('sha1').update(`bq9-seed:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

type UsageSpec = {
  zone: AnalyticsZone;
  feature: UsageFeature;
  budget: BudgetBand;
  category: MealCategory;
  hour: number;
  users: number[];
};

type SelectionSpec = {
  zone: AnalyticsZone;
  category: MealCategory;
  price: number;
  hour: number;
  users: number[];
};

const SIX = DEMO_USERS;
const FIVE = [0, 1, 2, 3, 4];
const FOUR = [0, 1, 2, 3];

const usageSpecs: UsageSpec[] = [
  // Bogotá Centro
  {
    zone: AnalyticsZone.BOGOTA_CENTRO,
    feature: UsageFeature.RESTAURANT_SEARCH,
    budget: BudgetBand.LOW,
    category: MealCategory.BOWLS,
    hour: 12,
    users: SIX,
  },
  {
    zone: AnalyticsZone.BOGOTA_CENTRO,
    feature: UsageFeature.RESTAURANT_SEARCH,
    budget: BudgetBand.MEDIUM,
    category: MealCategory.SUSHI,
    hour: 13,
    users: SIX,
  },
  {
    zone: AnalyticsZone.BOGOTA_CENTRO,
    feature: UsageFeature.RESTAURANT_SEARCH,
    budget: BudgetBand.HIGH,
    category: MealCategory.SALADS,
    hour: 18,
    users: FOUR,
  },

  {
    zone: AnalyticsZone.BOGOTA_CENTRO,
    feature: UsageFeature.RESTAURANT_DETAIL,
    budget: BudgetBand.LOW,
    category: MealCategory.BOWLS,
    hour: 12,
    users: SIX,
  },
  {
    zone: AnalyticsZone.BOGOTA_CENTRO,
    feature: UsageFeature.RESTAURANT_DETAIL,
    budget: BudgetBand.MEDIUM,
    category: MealCategory.SUSHI,
    hour: 13,
    users: SIX,
  },
  {
    zone: AnalyticsZone.BOGOTA_CENTRO,
    feature: UsageFeature.RESTAURANT_DETAIL,
    budget: BudgetBand.HIGH,
    category: MealCategory.SALADS,
    hour: 18,
    users: FOUR,
  },

  // Bogotá Chapinero
  {
    zone: AnalyticsZone.BOGOTA_CHAPINERO,
    feature: UsageFeature.RESTAURANT_SEARCH,
    budget: BudgetBand.LOW,
    category: MealCategory.BOWLS,
    hour: 12,
    users: FIVE,
  },
  {
    zone: AnalyticsZone.BOGOTA_CHAPINERO,
    feature: UsageFeature.RESTAURANT_SEARCH,
    budget: BudgetBand.MEDIUM,
    category: MealCategory.SUSHI,
    hour: 13,
    users: FIVE,
  },
  {
    zone: AnalyticsZone.BOGOTA_CHAPINERO,
    feature: UsageFeature.RESTAURANT_SEARCH,
    budget: BudgetBand.HIGH,
    category: MealCategory.SALADS,
    hour: 18,
    users: FOUR,
  },

  {
    zone: AnalyticsZone.BOGOTA_CHAPINERO,
    feature: UsageFeature.RESTAURANT_DETAIL,
    budget: BudgetBand.LOW,
    category: MealCategory.BOWLS,
    hour: 12,
    users: FIVE,
  },
  {
    zone: AnalyticsZone.BOGOTA_CHAPINERO,
    feature: UsageFeature.RESTAURANT_DETAIL,
    budget: BudgetBand.MEDIUM,
    category: MealCategory.SUSHI,
    hour: 13,
    users: FIVE,
  },
  {
    zone: AnalyticsZone.BOGOTA_CHAPINERO,
    feature: UsageFeature.RESTAURANT_DETAIL,
    budget: BudgetBand.HIGH,
    category: MealCategory.SALADS,
    hour: 18,
    users: FOUR,
  },
];

const selectionSpecs: SelectionSpec[] = [
  {
    zone: AnalyticsZone.BOGOTA_CENTRO,
    category: MealCategory.BOWLS,
    price: 14_000,
    hour: 12,
    users: FIVE,
  },
  {
    zone: AnalyticsZone.BOGOTA_CENTRO,
    category: MealCategory.SUSHI,
    price: 22_000,
    hour: 13,
    users: [1, 2, 3, 4, 5],
  },
  {
    zone: AnalyticsZone.BOGOTA_CENTRO,
    category: MealCategory.SALADS,
    price: 30_000,
    hour: 18,
    users: FOUR,
  },

  {
    zone: AnalyticsZone.BOGOTA_CHAPINERO,
    category: MealCategory.BOWLS,
    price: 14_000,
    hour: 12,
    users: FIVE,
  },
  {
    zone: AnalyticsZone.BOGOTA_CHAPINERO,
    category: MealCategory.SUSHI,
    price: 22_000,
    hour: 13,
    users: FIVE,
  },
  {
    zone: AnalyticsZone.BOGOTA_CHAPINERO,
    category: MealCategory.SALADS,
    price: 30_000,
    hour: 18,
    users: FOUR,
  },
];

async function seed(): Promise<void> {
  await dataSource.initialize();

  try {
    const users = dataSource.getRepository(User);
    const passwords = new PasswordService();
    const demoUsers: User[] = [];

    for (const index of DEMO_USERS) {
      const email = `bq9-demo-${String(index).padStart(2, '0')}@campusmeal.local`;

      let user = await users.findOneBy({ email });

      if (!user) {
        user = await users.save(
          users.create({
            name: `BQ9 Demo ${index}`,
            email,
            passwordHash: await passwords.hash(randomBytes(24).toString('hex')),
            role: UserRole.USER,
            active: false,
          }),
        );
      }

      demoUsers.push(user);
    }

    const usageRows: Partial<UsageEvent>[] = [];

    usageSpecs.forEach((spec, specIndex) => {
      spec.users.forEach((userIndex) => {
        usageRows.push({
          clientEventId: eventId(
            `${SEED_DATE}:usage:${specIndex}:${userIndex}`,
          ),
          userId: demoUsers[userIndex].id,
          eventType: UsageEventType.FEATURE_USED,
          feature: spec.feature,
          platform: ClientPlatform.ANDROID,
          zoneId: spec.zone,
          foodCategory: spec.category,
          budgetBand: spec.budget,
          occurredAt: instant(spec.hour),
          synthetic: true,
        });
      });
    });

    await dataSource
      .createQueryBuilder()
      .insert()
      .into(UsageEvent)
      .values(usageRows)
      .orIgnore()
      .execute();

    for (const [specIndex, spec] of selectionSpecs.entries()) {
      for (const userIndex of spec.users) {
        const user = demoUsers[userIndex];

        const runId = eventId(`${SEED_DATE}:run:${specIndex}:${userIndex}`);

        const alternativeId = eventId(
          `${SEED_DATE}:alternative:${specIndex}:${userIndex}`,
        );

        await dataSource
          .createQueryBuilder()
          .insert()
          .into(RecommendationRun)
          .values({
            id: runId,
            userId: user.id,
            availableMinutes: 60,
            maximumBudget: 50_000,
            explanationType: null,
            mainExplanation: 'Synthetic BQ9 verification fixture',
            zone: spec.zone,
            synthetic: true,
          })
          .orIgnore()
          .execute();

        await dataSource
          .createQueryBuilder()
          .insert()
          .into(RecommendationAlternative)
          .values({
            id: alternativeId,
            recommendationId: runId,
            type: MealAlternative.WALK,
            rank: 1,
            score: 100,
            recommended: true,
            estimatedMinutes: 10,
            estimatedCost: spec.price,
            metadata: {
              mealCategory: spec.category,
            },
          })
          .orIgnore()
          .execute();

        await dataSource
          .createQueryBuilder()
          .insert()
          .into(AnalyticsEvent)
          .values({
            clientEventId: eventId(
              `${SEED_DATE}:selection:${specIndex}:${userIndex}`,
            ),
            userId: user.id,
            recommendationId: runId,
            eventType: AnalyticsEventType.RECOMMENDATION_SELECTED,
            selectedAlternative: MealAlternative.WALK,
            platform: ClientPlatform.ANDROID,
            occurredAt: instant(spec.hour),
          })
          .orIgnore()
          .execute();
      }
    }

    console.log(`[seed:bq9] Synthetic BQ9 dataset prepared for ${SEED_DATE}.`);
    console.log(
      `[seed:bq9] Verify GET /api/v1/analytics/zone-demand?from=${SEED_DATE}&to=${SEED_DATE}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
