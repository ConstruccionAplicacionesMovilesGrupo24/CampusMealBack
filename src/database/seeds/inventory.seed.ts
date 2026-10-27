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
 * end to end. Idempotent through fixed ids: every run rewrites those same rows and shifts
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
const CORE_ITEMS: DemoInventoryItem[] = [
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

// Extra pantry so the inventory list looks like a real kitchen. Every ACTIVE extra item expires
// more than 3 days from today (or is already expired / inactive), so BQ2 keeps returning exactly
// Yogurt, Whole milk and Spinach and the BQ5 Cook score stays the same.
// Tuple: [name, quantity, unit, offsetDays, active, note]
type ExtraItem = [string, number, string, number, boolean, string];

const EXTRA_ITEMS: ExtraItem[] = [
  ['Eggs', 12, 'units', 10, true, 'outside the 3-day window'],
  ['Tomatoes', 6, 'units', 5, true, 'outside the 3-day window'],
  ['Onion', 4, 'units', 14, true, 'outside the 3-day window'],
  ['Garlic', 1, 'head', 20, true, 'outside the 3-day window'],
  ['Carrots', 500, 'g', 9, true, 'outside the 3-day window'],
  ['Potatoes', 2, 'kg', 25, true, 'outside the 3-day window'],
  ['Chicken breast', 600, 'g', 4, true, 'first day outside the 3-day window'],
  ['Ground beef', 500, 'g', 5, true, 'outside the 3-day window'],
  ['Pasta', 500, 'g', 120, true, 'pantry staple'],
  ['Black beans', 400, 'g', 180, true, 'pantry staple'],
  ['Lentils', 500, 'g', 150, true, 'pantry staple'],
  ['Olive oil', 0.5, 'L', 200, true, 'pantry staple'],
  ['Butter', 250, 'g', 21, true, 'outside the 3-day window'],
  ['Mozzarella', 200, 'g', 12, true, 'outside the 3-day window'],
  ['Bananas', 6, 'units', 6, true, 'outside the 3-day window'],
  ['Apples', 5, 'units', 12, true, 'outside the 3-day window'],
  ['Lemons', 4, 'units', 15, true, 'outside the 3-day window'],
  ['Avocado', 2, 'units', 5, true, 'outside the 3-day window'],
  ['Bell pepper', 3, 'units', 7, true, 'outside the 3-day window'],
  ['Broccoli', 1, 'head', 5, true, 'outside the 3-day window'],
  ['Mushrooms', 250, 'g', 4, true, 'first day outside the 3-day window'],
  ['Tortillas', 8, 'units', 8, true, 'outside the 3-day window'],
  ['Oats', 1, 'kg', 90, true, 'pantry staple'],
  ['Orange juice', 1, 'L', 11, true, 'outside the 3-day window'],
  ['Tofu', 400, 'g', 13, true, 'outside the 3-day window'],
  ['Chickpeas', 400, 'g', 160, true, 'pantry staple'],
  ['Corn', 2, 'cans', 240, true, 'pantry staple'],
  ['Coffee', 250, 'g', 150, true, 'pantry staple'],
  ['Sugar', 1, 'kg', 300, true, 'pantry staple'],
  ['Cilantro', 1, 'bunch', 4, true, 'first day outside the 3-day window'],
  ['Lettuce', 1, 'head', 5, true, 'outside the 3-day window'],
  ['Arepas', 6, 'units', 7, true, 'outside the 3-day window'],
  ['Plantain', 3, 'units', 6, true, 'outside the 3-day window'],
  ['Cucumber', 2, 'units', 7, true, 'outside the 3-day window'],
  [
    'Strawberries',
    250,
    'g',
    -2,
    true,
    'already expired, listed in GET /inventory only',
  ],
  [
    'Cream',
    200,
    'mL',
    -3,
    true,
    'already expired, listed in GET /inventory only',
  ],
  [
    'Fish fillet',
    300,
    'g',
    -1,
    true,
    'already expired, listed in GET /inventory only',
  ],
  ['Ham', 150, 'g', -5, true, 'already expired, listed in GET /inventory only'],
  ['Frozen peas', 500, 'g', 60, false, 'inactive, excluded everywhere'],
  ['Honey', 350, 'g', 400, false, 'inactive, excluded everywhere'],
];

const DEMO_ITEMS: DemoInventoryItem[] = [
  ...CORE_ITEMS,
  ...EXTRA_ITEMS.map(
    ([name, quantity, unit, offsetDays, active, note], index) => ({
      id: `3f6c0f4a-0001-4a3b-9c21-${String(index + 7).padStart(12, '0')}`,
      name,
      quantity,
      unit,
      offsetDays,
      active,
      note,
    }),
  ),
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
