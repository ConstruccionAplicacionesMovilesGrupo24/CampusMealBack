import 'reflect-metadata';
import { createHash, randomBytes } from 'crypto';
import { PasswordService } from '../../auth/password.service';
import { UsageEvent } from '../../analytics/entities/usage-event.entity';
import { ClientPlatform } from '../../analytics/enums/client-platform.enum';
import { UsageEventType } from '../../analytics/enums/usage-event-type.enum';
import { UsageFeature } from '../../analytics/enums/usage-feature.enum';
import { currentCalendarDate } from '../../inventory/inventory-date';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import dataSource from '../data-source';

/**
 * Synthetic BQ6 dataset (npm run seed:usage). Every event is marked `synthetic = true`.
 * Creates 10 inactive demo accounts (they cannot log in) and puts their events in the
 * previous calendar month in Bogotá (override with USAGE_SEED_MONTH=YYYY-MM), so the report
 * for that month shows:
 *   MEAL_COMPARISON 8/10 = 80%  -> flagged   (8 users with 0 or 1 use)
 *   INVENTORY       7/10 = 70%  -> not flagged
 *   RECIPES        10/10 = 100% -> flagged   (users with zero uses count)
 *   RESTAURANT_DETAIL 5/10 = 50% -> not flagged
 *   RESTAURANT_SEARCH 0/10 = 0%  -> not flagged
 * Idempotent: ids are deterministic and inserts are ON CONFLICT DO NOTHING.
 */

const USER_COUNT = 10;

// Uses per user (index u0..u9) for each feature.
const USES: Record<UsageFeature, number[]> = {
  [UsageFeature.INVENTORY]: [2, 2, 2, 1, 1, 0, 0, 0, 0, 0],
  [UsageFeature.MEAL_COMPARISON]: [3, 3, 1, 1, 0, 0, 0, 0, 0, 0],
  [UsageFeature.RECIPES]: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [UsageFeature.RESTAURANT_SEARCH]: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  [UsageFeature.RESTAURANT_DETAIL]: [2, 2, 2, 2, 2, 1, 1, 1, 1, 1],
};

function targetMonth(): string {
  const override = process.env.USAGE_SEED_MONTH;
  if (override) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(override)) {
      throw new Error('USAGE_SEED_MONTH must be in YYYY-MM format');
    }
    return override;
  }
  const today = currentCalendarDate();
  const year = today.month === 1 ? today.year - 1 : today.year;
  const month = today.month === 1 ? 12 : today.month - 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Deterministic UUID-shaped id so reruns hit the unique index instead of duplicating. */
function eventId(key: string): string {
  const h = createHash('sha1').update(`usage-seed:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function seed(): Promise<void> {
  const month = targetMonth();
  await dataSource.initialize();
  try {
    const users = dataSource.getRepository(User);
    const passwords = new PasswordService();
    const demoUsers: User[] = [];

    for (let i = 0; i < USER_COUNT; i++) {
      const email = `usage-demo-${String(i).padStart(2, '0')}@campusmeal.local`;
      let user = await users.findOneBy({ email });
      if (!user) {
        user = await users.save(
          users.create({
            name: `Usage Demo ${i}`,
            email,
            passwordHash: await passwords.hash(randomBytes(24).toString('hex')),
            role: UserRole.USER,
            active: false,
          }),
        );
        console.log(`[seed:usage] created inactive account ${email}`);
      }
      demoUsers.push(user);
    }

    // Day 15 at 17:00 UTC = 12:00 in Bogotá, safely inside the month.
    const base = Date.parse(`${month}-15T17:00:00Z`);
    const rows: Partial<UsageEvent>[] = [];
    demoUsers.forEach((user, u) => {
      rows.push({
        clientEventId: eventId(`${month}:${u}:session`),
        userId: user.id,
        eventType: UsageEventType.SESSION_STARTED,
        feature: null,
        platform: ClientPlatform.ANDROID,
        occurredAt: new Date(base + u * 60_000),
        synthetic: true,
      });
      for (const feature of Object.values(UsageFeature)) {
        for (let n = 0; n < USES[feature][u]; n++) {
          rows.push({
            clientEventId: eventId(`${month}:${u}:${feature}:${n}`),
            userId: user.id,
            eventType: UsageEventType.FEATURE_USED,
            feature,
            platform: ClientPlatform.ANDROID,
            occurredAt: new Date(base + u * 60_000 + (n + 1) * 1_000),
            synthetic: true,
          });
        }
      }
    });

    const result = await dataSource
      .createQueryBuilder()
      .insert()
      .into(UsageEvent)
      .values(rows)
      .orIgnore()
      .execute();
    console.log(
      `[seed:usage] ${rows.length} synthetic events prepared for ${month} (${result.identifiers.length} new). ` +
        `GET /api/v1/analytics/feature-adoption?month=${month} shows MEAL_COMPARISON 80% flagged, INVENTORY 70%.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
