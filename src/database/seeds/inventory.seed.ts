import 'reflect-metadata';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import {
  addCalendarDays,
  currentCalendarDate,
  formatCalendarDate,
} from '../../inventory/inventory-date';
import { User } from '../../users/entities/user.entity';
import { normalizeEmail } from '../../users/normalize-email';
import dataSource from '../data-source';

/**
 * Demo inventory for the auth seed's demo user (npm run seed:inventory), so BQ2 can be shown
 * end to end. Idempotent through fixed ids: every run rewrites those same six rows and shifts
 * their expiration dates relative to today in Bogotá, so the demo stays meaningful over time.
 * Rows of real users are never touched, and no password or token is printed.
 */

interface DemoInventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  /** Calendar days from today in America/Bogota. */
  offsetDays: number;
  active: boolean;
  note: string;
}

const DEFAULT_DEMO_USER_EMAIL = 'demo@campusmeal.local';

// Fixed ids keep the seed idempotent without a unique constraint on (user_id, name).
const DEMO_ITEMS: DemoInventoryItem[] = [
  {
    id: '3f6c0f4a-0001-4a3b-9c21-000000000001',
    name: 'Yogurt',
    quantity: 2,
    unit: 'cups',
    offsetDays: 0,
    active: true,
    note: 'expires today, first in BQ2',
  },
  {
    id: '3f6c0f4a-0001-4a3b-9c21-000000000002',
    name: 'Whole milk',
    quantity: 1,
    unit: 'L',
    offsetDays: 1,
    active: true,
    note: 'expires tomorrow',
  },
  {
    id: '3f6c0f4a-0001-4a3b-9c21-000000000003',
    name: 'Spinach',
    quantity: 250,
    unit: 'g',
    offsetDays: 3,
    active: true,
    note: 'last day still inside withinDays=3',
  },
  {
    id: '3f6c0f4a-0001-4a3b-9c21-000000000004',
    name: 'Rice',
    quantity: 1,
    unit: 'kg',
    offsetDays: 30,
    active: true,
    note: 'outside the 3-day window',
  },
  {
    id: '3f6c0f4a-0001-4a3b-9c21-000000000005',
    name: 'Bread',
    quantity: 1,
    unit: 'loaf',
    offsetDays: -1,
    active: true,
    note: 'already expired, excluded from BQ2 but listed in GET /inventory',
  },
  {
    id: '3f6c0f4a-0001-4a3b-9c21-000000000006',
    name: 'Cheese',
    quantity: 300,
    unit: 'g',
    offsetDays: 2,
    active: false,
    note: 'inactive, excluded everywhere',
  },
];

async function seed(): Promise<void> {
  const email = normalizeEmail(
    process.env.DEMO_USER_EMAIL || DEFAULT_DEMO_USER_EMAIL,
  );

  await dataSource.initialize();
  try {
    const demoUser = await dataSource.getRepository(User).findOneBy({ email });
    if (!demoUser) {
      throw new Error(
        `Demo user ${email} does not exist. Run npm run seed:auth first.`,
      );
    }

    const today = currentCalendarDate();
    const items = dataSource.getRepository(InventoryItem);

    for (const demoItem of DEMO_ITEMS) {
      const expirationDate = formatCalendarDate(
        addCalendarDays(today, demoItem.offsetDays),
      );
      const existing = await items.findOneBy({
        id: demoItem.id,
        userId: demoUser.id,
      });

      await items.save({
        id: demoItem.id,
        userId: demoUser.id,
        name: demoItem.name,
        quantity: demoItem.quantity,
        unit: demoItem.unit,
        expirationDate,
        active: demoItem.active,
      });

      const action = existing ? 'refreshed' : 'created';
      console.log(
        `[seed:inventory] ${action} ${demoItem.name} (${expirationDate}, active=${demoItem.active}) - ${demoItem.note}`,
      );
    }

    console.log(
      `[seed:inventory] ${DEMO_ITEMS.length} demo items ready for ${email}. ` +
        'GET /api/v1/inventory/expiring?withinDays=3 returns Yogurt, Whole milk and Spinach.',
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
