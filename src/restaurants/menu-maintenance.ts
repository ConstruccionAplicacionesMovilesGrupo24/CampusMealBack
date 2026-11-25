import { DataSource, EntityManager } from 'typeorm';
import { Meal } from './entities/meal.entity';
import { MenuRevision } from './entities/menu-revision.entity';
import { Restaurant } from './entities/restaurant.entity';
import { DietaryTag } from './enums/dietary-tag.enum';
import { MealCategory } from './enums/meal-category.enum';
import { MenuChangeType } from './enums/menu-change-type.enum';
import { MenuRevisionSource } from './enums/menu-revision-source.enum';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface NewMeal {
  name: string;
  price: number;
  mealCategory: MealCategory | null;
  dietaryTags: DietaryTag[];
}

export interface MenuEditResult {
  /** False when the requested value was already in place: no edit and no revision. */
  changed: boolean;
  revisionId: string | null;
  description: string;
}

/**
 * Sprint 4 / S4-03 (BQ13): the only writer of menu edits and their history.
 *
 * Each operation runs in one transaction that locks the meal row, applies the edit and appends a
 * `menu_revisions` row, so the history can never disagree with the catalog. An edit that does not
 * change anything writes nothing. There is deliberately no HTTP endpoint: existing roles are USER
 * and ANALYST, and neither may mutate the catalog. The team runs it through `npm run menu:edit`.
 */
export class MenuMaintenance {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  changePrice(
    restaurantRef: string,
    mealRef: string,
    price: number,
    note?: string,
  ): Promise<MenuEditResult> {
    if (!Number.isInteger(price) || price < 0) {
      throw new Error('price must be a non-negative integer (COP)');
    }
    return this.dataSource.transaction(async (manager) => {
      const restaurant = await findRestaurant(manager, restaurantRef);
      const meal = await findMealForUpdate(manager, restaurant, mealRef);
      if (meal.price === price) {
        return unchanged(`${meal.name} already costs ${price}`);
      }
      const previous = meal.price;
      await manager.update(Meal, { id: meal.id }, { price });
      const revision = await this.append(manager, {
        restaurantId: restaurant.id,
        mealId: meal.id,
        mealName: meal.name,
        changeType: MenuChangeType.PRICE_CHANGED,
        previousValue: { price: previous },
        newValue: { price },
        note,
      });
      return changed(revision, `${meal.name}: price ${previous} -> ${price}`);
    });
  }

  setAvailability(
    restaurantRef: string,
    mealRef: string,
    available: boolean,
    note?: string,
  ): Promise<MenuEditResult> {
    return this.dataSource.transaction(async (manager) => {
      const restaurant = await findRestaurant(manager, restaurantRef);
      const meal = await findMealForUpdate(manager, restaurant, mealRef);
      if (meal.available === available) {
        return unchanged(`${meal.name} is already available=${available}`);
      }
      await manager.update(Meal, { id: meal.id }, { available });
      const revision = await this.append(manager, {
        restaurantId: restaurant.id,
        mealId: meal.id,
        mealName: meal.name,
        changeType: MenuChangeType.AVAILABILITY_CHANGED,
        previousValue: { available: meal.available },
        newValue: { available },
        note,
      });
      return changed(
        revision,
        `${meal.name}: available ${meal.available} -> ${available}`,
      );
    });
  }

  addMeal(
    restaurantRef: string,
    meal: NewMeal,
    note?: string,
  ): Promise<MenuEditResult> {
    const name = meal.name.trim();
    if (name.length === 0 || name.length > 150) {
      throw new Error('name must have 1-150 characters');
    }
    if (!Number.isInteger(meal.price) || meal.price < 0) {
      throw new Error('price must be a non-negative integer (COP)');
    }
    return this.dataSource.transaction(async (manager) => {
      const restaurant = await findRestaurant(manager, restaurantRef);
      const existing = await manager.findOneBy(Meal, {
        restaurantId: restaurant.id,
        name,
      });
      if (existing) {
        throw new Error(
          `${restaurant.name} already has a meal named "${name}"`,
        );
      }
      const saved = await manager.save(
        manager.create(Meal, {
          restaurantId: restaurant.id,
          name,
          price: meal.price,
          mealCategory: meal.mealCategory,
          dietaryTags: meal.dietaryTags,
          available: true,
        }),
      );
      const revision = await this.append(manager, {
        restaurantId: restaurant.id,
        mealId: saved.id,
        mealName: saved.name,
        changeType: MenuChangeType.MENU_ITEM_ADDED,
        previousValue: null,
        newValue: {
          price: saved.price,
          mealCategory: saved.mealCategory,
          dietaryTags: saved.dietaryTags,
        },
        note,
      });
      return changed(revision, `${restaurant.name}: added ${saved.name}`);
    });
  }

  removeMeal(
    restaurantRef: string,
    mealRef: string,
    note?: string,
  ): Promise<MenuEditResult> {
    return this.dataSource.transaction(async (manager) => {
      const restaurant = await findRestaurant(manager, restaurantRef);
      const meal = await findMealForUpdate(manager, restaurant, mealRef);
      // The revision is appended first; deleting the meal then sets its meal_id to NULL.
      const revision = await this.append(manager, {
        restaurantId: restaurant.id,
        mealId: meal.id,
        mealName: meal.name,
        changeType: MenuChangeType.MENU_ITEM_REMOVED,
        previousValue: {
          price: meal.price,
          mealCategory: meal.mealCategory,
          available: meal.available,
        },
        newValue: null,
        note,
      });
      await manager.delete(Meal, { id: meal.id });
      return changed(revision, `${restaurant.name}: removed ${meal.name}`);
    });
  }

  private append(
    manager: EntityManager,
    row: Pick<
      MenuRevision,
      | 'restaurantId'
      | 'mealId'
      | 'mealName'
      | 'changeType'
      | 'previousValue'
      | 'newValue'
    > & { note?: string },
  ): Promise<MenuRevision> {
    return manager.save(
      manager.create(MenuRevision, {
        ...row,
        note: row.note?.slice(0, 200) ?? null,
        changedAt: this.clock(),
        source: MenuRevisionSource.MAINTENANCE_SCRIPT,
      }),
    );
  }
}

async function findRestaurant(
  manager: EntityManager,
  ref: string,
): Promise<Restaurant> {
  const matches = UUID.test(ref)
    ? await manager.findBy(Restaurant, { id: ref })
    : await manager.findBy(Restaurant, { name: ref });
  if (matches.length === 0) {
    throw new Error(`Restaurant not found: ${ref}`);
  }
  if (matches.length > 1) {
    throw new Error(`Several restaurants are named "${ref}"; use its id`);
  }
  return matches[0];
}

async function findMealForUpdate(
  manager: EntityManager,
  restaurant: Restaurant,
  ref: string,
): Promise<Meal> {
  const where = UUID.test(ref)
    ? { id: ref, restaurantId: restaurant.id }
    : { name: ref, restaurantId: restaurant.id };
  const meals = await manager.find(Meal, {
    where,
    lock: { mode: 'pessimistic_write' },
  });
  if (meals.length === 0) {
    throw new Error(`Meal not found in ${restaurant.name}: ${ref}`);
  }
  if (meals.length > 1) {
    throw new Error(`Several meals are named "${ref}"; use its id`);
  }
  return meals[0];
}

function unchanged(description: string): MenuEditResult {
  return { changed: false, revisionId: null, description };
}

function changed(revision: MenuRevision, description: string): MenuEditResult {
  return { changed: true, revisionId: revision.id, description };
}
