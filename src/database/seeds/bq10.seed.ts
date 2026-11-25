import 'reflect-metadata';
import { createHash, randomBytes } from 'crypto';
import { UsageEvent } from '../../analytics/entities/usage-event.entity';
import { AnalyticsZone } from '../../analytics/enums/analytics-zone.enum';
import { BudgetBand } from '../../analytics/enums/budget-band.enum';
import { ClientPlatform } from '../../analytics/enums/client-platform.enum';
import { UsageEventType } from '../../analytics/enums/usage-event-type.enum';
import { UsageFeature } from '../../analytics/enums/usage-feature.enum';
import { PasswordService } from '../../auth/password.service';
import { MealCategory } from '../../restaurants/enums/meal-category.enum';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import dataSource from '../data-source';

// Only synthetic demand is persisted. Never change the shared restaurant catalog.
const NORMAL_DATE = '2026-11-17';
const SPARSE_DATE = '2026-11-18';
const FIVE = [0, 1, 2, 3, 4];

function eventId(key: string): string {
  const h = createHash('sha256').update(`bq10-seed:v1:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function seed(): Promise<void> {
  await dataSource.initialize();
  try {
    const passwords = new PasswordService();
    const result = await dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const demoUsers: User[] = [];
      for (const index of FIVE) {
        const email = `bq10-demo-${index}@campusmeal.local`;
        let user = await users.findOneBy({ email });
        if (!user) {
          user = await users.save(
            users.create({
              name: `BQ10 Demo ${index}`,
              email,
              passwordHash: await passwords.hash(
                randomBytes(32).toString('hex'),
              ),
              role: UserRole.USER,
              active: false,
            }),
          );
        }
        if (
          user.active ||
          user.role !== UserRole.USER ||
          user.name !== `BQ10 Demo ${index}`
        ) {
          throw new Error(
            `Unexpected account with reserved BQ10 demo email at index ${index}; aborting.`,
          );
        }
        demoUsers.push(user);
      }
      const rows: Partial<UsageEvent>[] = [];
      function add(
        date: string,
        zone: AnalyticsZone,
        category: MealCategory,
        indices: number[],
        repeats = 1,
      ): void {
        for (const index of indices) {
          for (let n = 0; n < repeats; n++) {
            rows.push({
              clientEventId: eventId(
                `${date}:${zone}:${category}:${index}:${n}`,
              ),
              userId: demoUsers[index].id,
              eventType: UsageEventType.FEATURE_USED,
              feature: UsageFeature.RESTAURANT_SEARCH,
              platform: ClientPlatform.ANDROID,
              zoneId: zone,
              foodCategory: category,
              budgetBand: BudgetBand.MEDIUM,
              occurredAt: new Date(`${date}T12:0${n}:00-05:00`),
              synthetic: true,
            });
          }
        }
      }
      add(NORMAL_DATE, AnalyticsZone.BOGOTA_CENTRO, MealCategory.SUSHI, FIVE);
      add(NORMAL_DATE, AnalyticsZone.BOGOTA_CENTRO, MealCategory.SOUPS, FIVE);
      add(
        NORMAL_DATE,
        AnalyticsZone.BOGOTA_CENTRO,
        MealCategory.BOWLS,
        FIVE,
        3,
      );
      add(
        NORMAL_DATE,
        AnalyticsZone.BOGOTA_CHAPINERO,
        MealCategory.SUSHI,
        FIVE,
      );
      add(
        SPARSE_DATE,
        AnalyticsZone.BOGOTA_CENTRO,
        MealCategory.SUSHI,
        FIVE.slice(0, 4),
      );
      add(SPARSE_DATE, AnalyticsZone.BOGOTA_CENTRO, MealCategory.BOWLS, FIVE);
      await manager
        .createQueryBuilder()
        .insert()
        .into(UsageEvent)
        .values(rows)
        .orIgnore()
        .execute();
      const count = await manager
        .getRepository(UsageEvent)
        .createQueryBuilder('e')
        .where('e.clientEventId IN (:...ids)', {
          ids: rows.map((row) => row.clientEventId),
        })
        .andWhere('e.userId IN (:...users)', {
          users: demoUsers.map((user) => user.id),
        })
        .andWhere('e.synthetic = true')
        .getCount();
      if (count !== rows.length)
        throw new Error(
          `Expected ${rows.length} synthetic events, found ${count}`,
        );
      return count;
    });
    console.log(
      `[seed:bq10] Verified ${result} synthetic search events (existing + new; not an inserted-row count).`,
    );
    console.log(
      `[seed:bq10] Centro normal: zone=bogota-centro&from=${NORMAL_DATE}&to=${NORMAL_DATE}&dataset=SYNTHETIC`,
    );
    console.log(
      `[seed:bq10] Centro sparse: zone=bogota-centro&from=${SPARSE_DATE}&to=${SPARSE_DATE}&dataset=SYNTHETIC`,
    );
    console.log(
      `[seed:bq10] Chapinero: zone=bogota-chapinero&from=${NORMAL_DATE}&to=${NORMAL_DATE}&dataset=SYNTHETIC`,
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
