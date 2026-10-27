import { DietaryTag } from '../restaurants/enums/dietary-tag.enum';

/** Version of the `GET /recipes` response shape. Clients reject versions they do not know. */
export const RECIPE_CONTRACT_VERSION = 1;

/** Contract bounds (docs/SPRINT3_BQ3.md), checked by the seed before anything is written. */
export const RECIPE_LIMITS = {
  maxRecipes: 200,
  nameMaxLength: 150,
  minPreparationMinutes: 1,
  maxPreparationMinutes: 240,
  minServings: 1,
  maxServings: 20,
  maxIngredients: 20,
  maxSteps: 15,
} as const;

/** Units a recipe ingredient may use. Inventory units are mapped onto these by the client. */
export enum RecipeUnit {
  G = 'g',
  KG = 'kg',
  ML = 'ml',
  L = 'L',
  UNIT = 'unit',
}

export interface CatalogIngredient {
  /** Display name. */
  name: string;
  /** Matching key: see normalizeIngredientName. */
  normalizedName: string;
  /** Extra matching keys, already normalized. */
  aliases: string[];
  /** Amount for the whole recipe yield (`servings`); no implicit scaling. */
  quantity: number;
  unit: RecipeUnit;
  /** Optional ingredients never prevent a match. */
  optional: boolean;
}

export interface CatalogRecipe {
  id: string;
  name: string;
  preparationMinutes: number;
  servings: number;
  dietaryTags: DietaryTag[];
  ingredients: CatalogIngredient[];
  steps: string[];
}

export interface RecipeCatalog {
  catalogVersion: string;
  /** When this catalog version was produced (fixed, never the request time). */
  generatedAt: string;
  recipes: CatalogRecipe[];
}

/**
 * BQ3 name normalization shared with the Android evaluator: lowercase, trim,
 * remove accents (NFD + strip combining marks) and collapse repeated whitespace.
 */
export function normalizeIngredientName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
