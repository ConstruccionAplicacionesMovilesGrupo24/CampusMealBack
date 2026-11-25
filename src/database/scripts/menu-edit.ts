import 'reflect-metadata';
import { parseArgs } from 'util';
import dataSource from '../data-source';
import { DietaryTag } from '../../restaurants/enums/dietary-tag.enum';
import { MealCategory } from '../../restaurants/enums/meal-category.enum';
import { MenuMaintenance } from '../../restaurants/menu-maintenance';

/**
 * Sprint 4 / S4-03: controlled menu maintenance for BQ13. Every effective edit appends one
 * menu_revisions row in the same transaction; an edit that changes nothing writes nothing.
 *
 *   npm run menu:edit -- price        --restaurant "Green Bowl" --meal "Vegetarian bowl" --value 19000 [--note "..."]
 *   npm run menu:edit -- availability --restaurant "Green Bowl" --meal "Vegetarian bowl" --value false
 *   npm run menu:edit -- add          --restaurant "Green Bowl" --name "Lentil bowl" --price 17000 --category BOWLS [--tags VEGAN,GLUTEN_FREE]
 *   npm run menu:edit -- remove       --restaurant "Green Bowl" --meal "Lentil bowl"
 *
 * Deployed database: `npm run build && node --env-file=.env.render dist/database/scripts/menu-edit.js <same args>`
 * (`npm run menu:edit:prod -- …` does the second step).
 */
const USAGE =
  'usage: menu:edit <price|availability|add|remove> --restaurant <name|id> [--meal <name|id>] [--value v] [--name n --price p --category c --tags a,b] [--note text]';

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      restaurant: { type: 'string' },
      meal: { type: 'string' },
      value: { type: 'string' },
      name: { type: 'string' },
      price: { type: 'string' },
      category: { type: 'string' },
      tags: { type: 'string' },
      note: { type: 'string' },
    },
  });
  const [operation] = positionals;
  const restaurant = required(values.restaurant, '--restaurant');

  await dataSource.initialize();
  try {
    const maintenance = new MenuMaintenance(dataSource);
    let result;
    switch (operation) {
      case 'price':
        result = await maintenance.changePrice(
          restaurant,
          required(values.meal, '--meal'),
          integer(required(values.value, '--value'), '--value'),
          values.note,
        );
        break;
      case 'availability': {
        const value = required(values.value, '--value');
        if (value !== 'true' && value !== 'false') {
          throw new Error('--value must be true or false');
        }
        result = await maintenance.setAvailability(
          restaurant,
          required(values.meal, '--meal'),
          value === 'true',
          values.note,
        );
        break;
      }
      case 'add':
        result = await maintenance.addMeal(
          restaurant,
          {
            name: required(values.name, '--name'),
            price: integer(required(values.price, '--price'), '--price'),
            mealCategory: values.category
              ? enumValue(MealCategory, values.category, '--category')
              : null,
            dietaryTags: (values.tags ?? '')
              .split(',')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
              .map((tag) => enumValue(DietaryTag, tag, '--tags')),
          },
          values.note,
        );
        break;
      case 'remove':
        result = await maintenance.removeMeal(
          restaurant,
          required(values.meal, '--meal'),
          values.note,
        );
        break;
      default:
        throw new Error(USAGE);
    }
    console.log(
      result.changed
        ? `[menu:edit] ${result.description} (revision ${result.revisionId})`
        : `[menu:edit] No change: ${result.description}. No revision recorded.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${flag} is required. ${USAGE}`);
  }
  return value;
}

function integer(value: string, flag: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${flag} must be a non-negative integer`);
  }
  return Number(value);
}

function enumValue<T extends Record<string, string>>(
  type: T,
  value: string,
  flag: string,
): T[keyof T] {
  const match = Object.values(type).find((candidate) => candidate === value);
  if (!match) {
    throw new Error(`${flag} must be one of ${Object.values(type).join(', ')}`);
  }
  return match as T[keyof T];
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
