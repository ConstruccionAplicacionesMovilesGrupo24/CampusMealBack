import 'reflect-metadata';
import { isUUID } from 'class-validator';
import { DEMO_RECIPE_CATALOG } from '../../recipes/demo-recipe-catalog';
import {
  RECIPE_CATALOG_ROW_ID,
  RecipeCatalogRow,
} from '../../recipes/entities/recipe-catalog.entity';
import {
  normalizeIngredientName,
  RECIPE_LIMITS,
  RecipeCatalog,
  RecipeUnit,
} from '../../recipes/recipe-catalog.types';
import { DietaryTag } from '../../restaurants/enums/dietary-tag.enum';
import dataSource from '../data-source';

/**
 * Stores the authored BQ3 recipe catalog (npm run seed:recipes). It touches only the
 * recipe_catalog table: no accounts, inventory, recommendations or analytics, and no demo
 * users are needed.
 *
 * Idempotent: re-running with the same catalogVersion and content changes nothing (the stored
 * generatedAt is kept). A different catalogVersion replaces the catalog atomically. The same
 * version with different content is refused, because clients cache by catalogVersion.
 */

const UNITS = new Set<string>(Object.values(RecipeUnit));
const TAGS = new Set<string>(Object.values(DietaryTag));
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const isInt = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max;
const isText = (value: string, max = Infinity) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isNormalized = (value: string) =>
  value.length > 0 && normalizeIngredientName(value) === value;

function catalogProblems(catalog: RecipeCatalog): string[] {
  const problems: string[] = [];
  const L = RECIPE_LIMITS;

  if (!isText(catalog.catalogVersion, 40)) {
    problems.push(
      'catalogVersion must be a non-blank string of at most 40 characters',
    );
  }
  if (
    !ISO_INSTANT.test(catalog.generatedAt) ||
    new Date(catalog.generatedAt).toISOString() !== catalog.generatedAt
  ) {
    problems.push(
      'generatedAt must be an ISO-8601 UTC instant like 2026-10-27T12:00:00.000Z',
    );
  }
  if (catalog.recipes.length > L.maxRecipes) {
    problems.push(`at most ${L.maxRecipes} recipes are allowed`);
  }

  const ids = new Set<string>();
  catalog.recipes.forEach((recipe, r) => {
    const at = `recipes[${r}] (${recipe.name})`;
    if (!isUUID(recipe.id)) problems.push(`${at}: id must be a UUID`);
    if (ids.has(recipe.id)) problems.push(`${at}: duplicate id ${recipe.id}`);
    ids.add(recipe.id);
    if (!isText(recipe.name, L.nameMaxLength)) {
      problems.push(`${at}: name must have 1-${L.nameMaxLength} characters`);
    }
    if (
      !isInt(
        recipe.preparationMinutes,
        L.minPreparationMinutes,
        L.maxPreparationMinutes,
      )
    ) {
      problems.push(
        `${at}: preparationMinutes must be an integer ${L.minPreparationMinutes}-${L.maxPreparationMinutes}`,
      );
    }
    if (!isInt(recipe.servings, L.minServings, L.maxServings)) {
      problems.push(
        `${at}: servings must be an integer ${L.minServings}-${L.maxServings}`,
      );
    }
    if (
      recipe.dietaryTags.some((tag) => !TAGS.has(tag)) ||
      new Set(recipe.dietaryTags).size !== recipe.dietaryTags.length
    ) {
      problems.push(
        `${at}: dietaryTags must be distinct values of ${[...TAGS].join(', ')}`,
      );
    }

    const { ingredients } = recipe;
    if (ingredients.length < 1 || ingredients.length > L.maxIngredients) {
      problems.push(`${at}: 1-${L.maxIngredients} ingredients are required`);
    }
    if (!ingredients.some((ingredient) => !ingredient.optional)) {
      problems.push(`${at}: at least one ingredient must be required`);
    }
    // One inventory name must never satisfy two ingredients of the same recipe.
    const keys = new Set<string>();
    ingredients.forEach((ingredient, i) => {
      const where = `${at}.ingredients[${i}] (${ingredient.name})`;
      if (!isText(ingredient.name))
        problems.push(`${where}: name must not be blank`);
      for (const key of [ingredient.normalizedName, ...ingredient.aliases]) {
        if (!isNormalized(key))
          problems.push(`${where}: "${key}" is not normalized`);
        if (keys.has(key))
          problems.push(
            `${where}: matching key "${key}" is used twice in this recipe`,
          );
        keys.add(key);
      }
      if (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0) {
        problems.push(`${where}: quantity must be a finite number > 0`);
      }
      if (!UNITS.has(ingredient.unit)) {
        problems.push(`${where}: unit must be one of ${[...UNITS].join(', ')}`);
      }
      if (typeof ingredient.optional !== 'boolean') {
        problems.push(`${where}: optional must be a boolean`);
      }
    });

    if (recipe.steps.length < 1 || recipe.steps.length > L.maxSteps) {
      problems.push(`${at}: 1-${L.maxSteps} steps are required`);
    }
    if (recipe.steps.some((step) => !isText(step))) {
      problems.push(`${at}: steps must not be blank`);
    }
  });
  return problems;
}

interface StoredCatalog {
  catalog_version: string;
  generated_at: Date;
  same_recipes: boolean;
}

async function seed(): Promise<void> {
  const catalog = DEMO_RECIPE_CATALOG;
  const problems = catalogProblems(catalog);
  if (problems.length) {
    throw new Error(
      `Invalid recipe catalog ${catalog.catalogVersion}:\n  - ${problems.join('\n  - ')}`,
    );
  }

  await dataSource.initialize();
  try {
    const outcome = await dataSource.transaction(async (manager) => {
      // jsonb equality ignores key order and formatting, so it compares content only.
      const [stored] = await manager.query<StoredCatalog[]>(
        `SELECT catalog_version, generated_at, recipes = $1::jsonb AS same_recipes
           FROM recipe_catalog WHERE id = $2 FOR UPDATE`,
        [JSON.stringify(catalog.recipes), RECIPE_CATALOG_ROW_ID],
      );
      const row = {
        id: RECIPE_CATALOG_ROW_ID,
        catalogVersion: catalog.catalogVersion,
        generatedAt: new Date(catalog.generatedAt),
        recipes: catalog.recipes,
      };
      const catalogs = manager.getRepository(RecipeCatalogRow);

      if (!stored) {
        await catalogs.insert(row);
        return 'created';
      }
      if (stored.catalog_version === catalog.catalogVersion) {
        const sameInstant =
          stored.generated_at.toISOString() === catalog.generatedAt;
        if (stored.same_recipes && sameInstant) return 'unchanged';
        throw new Error(
          `The stored catalog ${catalog.catalogVersion} differs from the authored one. ` +
            'Bump catalogVersion and generatedAt in src/recipes/demo-recipe-catalog.ts.',
        );
      }
      await catalogs.update({ id: RECIPE_CATALOG_ROW_ID }, row);
      return `replaced ${stored.catalog_version}`;
    });

    console.log(
      `[seed:recipes] catalog ${catalog.catalogVersion} (${catalog.recipes.length} recipes, generatedAt ${catalog.generatedAt}): ${outcome}`,
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
