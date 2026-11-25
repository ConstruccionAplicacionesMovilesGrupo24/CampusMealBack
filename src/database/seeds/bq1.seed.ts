import 'reflect-metadata';
import { createHash, randomBytes } from 'crypto';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { PerformanceEvent } from '../../analytics/entities/performance-event.entity';
import { ClientPlatform } from '../../analytics/enums/client-platform.enum';
import { ComparisonLoadOutcome } from '../../analytics/enums/comparison-load-outcome.enum';
import { PerformanceEventType } from '../../analytics/enums/performance-event-type.enum';
import { PerformanceScreen } from '../../analytics/enums/performance-screen.enum';
import { PasswordService } from '../../auth/password.service';
import { User } from '../../users/entities/user.entity';
import { UserRole } from '../../users/enums/user-role.enum';
import { parseCalendarDate } from '../../inventory/inventory-date';
import dataSource from '../data-source';

/**
 * Sprint 4 / S4-09: deterministic, clearly synthetic BQ1 dataset (npm run seed:bq1).
 *
 * Every row has synthetic = true and only appears with includeSynthetic=true. Re-running it is a
 * no-op (stable ids + ON CONFLICT DO NOTHING). Expected values: docs/SPRINT4_BQ1.md §6.
 *
 *   Demo A  1/100 crashes = exactly 1%      94 x 1000 + 6 x 2500 -> p95 2500 (flagged)
 *   Demo B  2/100 crashes (flagged)         20 x 2000            -> p95 2000 (not flagged)
 *   Demo C  no sessions -> null             no fresh loads       -> null; only other outcomes
 *   Demo D  1/3 crashes, INSUFFICIENT       1 x 5000, INSUFFICIENT; one crash without session
 *   Demo E  0/100 crashes                   95 x 1000 + 5 x 2500 -> p95 1000 (not flagged)
 */
const SEED_DATE = process.env.BQ1_SEED_DATE ?? '2026-11-20';
const USERS = [0, 1, 2, 3, 4];
const OS = 'Android 16 (demo)';
const APP = '0.5.0-demo';

interface Combination {
  device: string;
  sessions: number;
  crashes: number;
  orphanCrashes: number;
  /** [duration, how many] of FRESH_NETWORK loads */
  fresh: [number, number][];
  others: [ComparisonLoadOutcome, number | null, number][];
}

const COMBINATIONS: Combination[] = [
  {
    device: 'Demo A',
    sessions: 100,
    crashes: 1,
    orphanCrashes: 0,
    fresh: [
      [1000, 94],
      [2500, 6],
    ],
    others: [],
  },
  {
    device: 'Demo B',
    sessions: 100,
    crashes: 2,
    orphanCrashes: 0,
    fresh: [[2000, 20]],
    others: [],
  },
  {
    device: 'Demo C',
    sessions: 0,
    crashes: 0,
    orphanCrashes: 0,
    fresh: [],
    others: [
      [ComparisonLoadOutcome.CACHED_RESTORE, 40, 2],
      [ComparisonLoadOutcome.OFFLINE_HISTORY, 300, 1],
      [ComparisonLoadOutcome.ERROR, null, 3],
      [ComparisonLoadOutcome.TIMEOUT, null, 2],
      [ComparisonLoadOutcome.CANCELLED, null, 1],
    ],
  },
  {
    device: 'Demo D',
    sessions: 3,
    crashes: 1,
    orphanCrashes: 1,
    fresh: [[5000, 1]],
    others: [[ComparisonLoadOutcome.ERROR, null, 1]],
  },
  {
    device: 'Demo E',
    sessions: 100,
    crashes: 0,
    orphanCrashes: 0,
    fresh: [
      [1000, 95],
      [2500, 5],
    ],
    others: [],
  },
];

function stableId(key: string): string {
  const h = createHash('sha1')
    .update(`bq1-seed:${SEED_DATE}:${key}`)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Noon in Bogotá (UTC-5, no daylight saving) of the anchor date. */
function anchor(): Date {
  if (!parseCalendarDate(SEED_DATE)) {
    throw new Error(`BQ1_SEED_DATE must be YYYY-MM-DD, got ${SEED_DATE}`);
  }
  return new Date(`${SEED_DATE}T12:00:00-05:00`);
}

async function seed(): Promise<void> {
  const occurredAt = anchor();
  await dataSource.initialize();
  try {
    const repository = dataSource.getRepository(User);
    const passwords = new PasswordService();
    const users: User[] = [];
    for (const index of USERS) {
      const email = `bq1-demo-${String(index).padStart(2, '0')}@campusmeal.local`;
      const existing = await repository.findOneBy({ email });
      users.push(
        existing ??
          (await repository.save(
            repository.create({
              name: `BQ1 Demo ${index}`,
              email,
              passwordHash: await passwords.hash(
                randomBytes(24).toString('hex'),
              ),
              role: UserRole.USER,
              active: false,
            }),
          )),
      );
    }

    const rows: QueryDeepPartialEntity<PerformanceEvent>[] = [];
    const add = (
      combo: Combination,
      index: number,
      key: string,
      values: QueryDeepPartialEntity<PerformanceEvent>,
    ) =>
      rows.push({
        clientEventId: stableId(`event:${combo.device}:${key}:${index}`),
        userId: users[index % users.length].id,
        platform: ClientPlatform.ANDROID,
        deviceModel: combo.device,
        osVersion: OS,
        appVersion: APP,
        synthetic: true,
        occurredAt,
        ...values,
      });

    for (const combo of COMBINATIONS) {
      for (let i = 0; i < combo.sessions; i++) {
        const sessionId = stableId(`session:${combo.device}:${i}`);
        add(combo, i, 'start', {
          eventType: PerformanceEventType.SESSION_START,
          sessionId,
        });
        if (i < combo.crashes) {
          add(combo, i, 'crash', {
            eventType: PerformanceEventType.FATAL_CRASH,
            sessionId,
            exceptionClass: 'java.lang.IllegalStateException',
          });
        }
      }
      for (let i = 0; i < combo.orphanCrashes; i++) {
        add(combo, i, 'orphan', {
          eventType: PerformanceEventType.FATAL_CRASH,
          sessionId: stableId(`orphan:${combo.device}:${i}`),
          exceptionClass: 'java.lang.OutOfMemoryError',
        });
      }
      const loads: [ComparisonLoadOutcome, number | null, number][] = [
        ...combo.fresh.map(
          ([duration, count]): [ComparisonLoadOutcome, number, number] => [
            ComparisonLoadOutcome.FRESH_NETWORK,
            duration,
            count,
          ],
        ),
        ...combo.others,
      ];
      let loadIndex = 0;
      for (const [outcome, durationMs, count] of loads) {
        for (let i = 0; i < count; i++) {
          add(combo, loadIndex, 'load', {
            eventType: PerformanceEventType.COMPARISON_LOAD,
            loadId: stableId(`load:${combo.device}:${loadIndex}`),
            screen: PerformanceScreen.MEAL_COMPARISON,
            outcome,
            durationMs,
          });
          loadIndex++;
        }
      }
    }

    await dataSource
      .createQueryBuilder()
      .insert()
      .into(PerformanceEvent)
      .values(rows)
      .orIgnore()
      .execute();

    console.log(
      `[seed:bq1] ${rows.length} synthetic records prepared for ${SEED_DATE}.`,
    );
    console.log(
      `[seed:bq1] GET /api/v1/analytics/performance?from=${SEED_DATE}&to=${SEED_DATE}&includeSynthetic=true`,
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
