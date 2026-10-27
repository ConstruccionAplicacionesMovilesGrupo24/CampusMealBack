import { DietaryTag } from '../restaurants/enums/dietary-tag.enum';
import {
  CatalogIngredient,
  RecipeCatalog,
  RecipeUnit,
} from './recipe-catalog.types';

/**
 * Authored demonstration catalog for BQ3 (npm run seed:recipes). These recipes are written by
 * the team; they are not user data or usage statistics.
 *
 * Bump catalogVersion and generatedAt together whenever any recipe or matching field changes:
 * clients use catalogVersion as their cache key, and the seed refuses to overwrite a stored
 * catalog whose content differs under the same version.
 *
 * Quantities are for the whole yield (`servings`). Every food the steps use is listed; tap water
 * is the only thing assumed to be available. Dry rice and cooked chickpeas keep distinct
 * identities because their quantities are not interchangeable with other forms.
 */

const { G, ML, UNIT } = RecipeUnit;
const { VEGETARIAN, VEGAN, GLUTEN_FREE } = DietaryTag;

const ingredient = (
  name: string,
  normalizedName: string,
  aliases: string[],
  quantity: number,
  unit: RecipeUnit,
  optional = false,
): CatalogIngredient => ({
  name,
  normalizedName,
  aliases,
  quantity,
  unit,
  optional,
});

// Shared identities, so the same food matches the same inventory names in every recipe.
const rice = (grams: number) =>
  ingredient(
    'Rice (uncooked)',
    'rice',
    ['white rice', 'arroz', 'arroz blanco'],
    grams,
    G,
  );
const spinach = (grams: number) =>
  ingredient(
    'Spinach',
    'spinach',
    ['baby spinach', 'espinaca', 'espinacas'],
    grams,
    G,
  );
const tomato = (grams: number) =>
  ingredient('Tomato', 'tomato', ['tomatoes', 'tomate', 'tomates'], grams, G);

export const DEMO_RECIPE_CATALOG: RecipeCatalog = {
  catalogVersion: '2026-10-27.1',
  generatedAt: '2026-10-27T12:00:00.000Z',
  recipes: [
    {
      id: 'd3dd01dc-1a0b-463b-a917-d938f02c5dbb',
      name: 'Spinach rice',
      preparationMinutes: 20,
      servings: 1,
      dietaryTags: [VEGETARIAN, VEGAN, GLUTEN_FREE],
      ingredients: [rice(150), spinach(50)],
      steps: [
        'Rinse the rice and cook it in 300 ml of boiling water, covered, for 15 minutes.',
        'Chop the spinach.',
        'Stir the spinach into the hot rice and keep it covered for 2 minutes until wilted.',
      ],
    },
    {
      id: '6fa3803c-e8c1-47eb-b9e1-78c9f919d445',
      name: 'Milk rice',
      preparationMinutes: 25,
      servings: 2,
      dietaryTags: [VEGETARIAN, GLUTEN_FREE],
      ingredients: [
        rice(100),
        ingredient(
          'Whole milk',
          'whole milk',
          ['milk', 'leche', 'leche entera'],
          200,
          ML,
        ),
        ingredient('Ground cinnamon', 'cinnamon', ['canela'], 1, G, true),
      ],
      steps: [
        'Cook the rice in 200 ml of water for 10 minutes.',
        'Add the milk and simmer, stirring often, for 12 minutes until creamy.',
        'Sprinkle with cinnamon if you have it.',
      ],
    },
    {
      id: 'acc8498d-c078-42b9-980a-ab8a10e4755f',
      name: 'Spinach omelette',
      preparationMinutes: 15,
      servings: 1,
      dietaryTags: [VEGETARIAN, GLUTEN_FREE],
      ingredients: [
        ingredient('Eggs', 'egg', ['eggs', 'huevo', 'huevos'], 2, UNIT),
        spinach(50),
        ingredient(
          'Grated cheese',
          'cheese',
          ['grated cheese', 'queso', 'queso rallado'],
          30,
          G,
          true,
        ),
      ],
      steps: [
        'Beat the eggs.',
        'Cook the spinach in a non-stick pan for 2 minutes.',
        'Pour in the eggs, add the cheese if you have it, and cook until set.',
      ],
    },
    {
      id: '3e3b73ca-137d-416c-a14a-0b195e46bc69',
      name: 'Tomato and cucumber salad',
      preparationMinutes: 10,
      servings: 1,
      dietaryTags: [VEGETARIAN, VEGAN, GLUTEN_FREE],
      ingredients: [
        tomato(150),
        ingredient(
          'Cucumber',
          'cucumber',
          ['cucumbers', 'pepino', 'pepinos'],
          100,
          G,
        ),
        ingredient(
          'Lime',
          'lime',
          ['limes', 'limon', 'limones'],
          1,
          UNIT,
          true,
        ),
      ],
      steps: [
        'Wash and dice the tomato and the cucumber.',
        'Mix them in a bowl.',
        'Squeeze the lime over the salad if you have one.',
      ],
    },
    {
      id: 'ec3a038a-c0b6-4455-a88c-d8ba974ec718',
      name: 'Chickpea stew',
      preparationMinutes: 35,
      servings: 2,
      dietaryTags: [VEGETARIAN, VEGAN, GLUTEN_FREE],
      ingredients: [
        ingredient(
          'Cooked chickpeas',
          'cooked chickpeas',
          ['canned chickpeas', 'garbanzos cocidos', 'garbanzos enlatados'],
          200,
          G,
        ),
        tomato(100),
        ingredient(
          'Onion',
          'onion',
          ['onions', 'cebolla', 'cebollas'],
          50,
          G,
          true,
        ),
      ],
      steps: [
        'If you have onion, chop it and cook it in a pot with 2 tablespoons of water for 3 minutes.',
        'Dice the tomato, add it and cook for 5 minutes.',
        'Add the chickpeas and 150 ml of water, then simmer for 20 minutes.',
      ],
    },
    {
      id: '3c11947c-d305-4a56-96bd-f319642d3f84',
      name: 'Chicken rice',
      preparationMinutes: 40,
      servings: 2,
      dietaryTags: [GLUTEN_FREE],
      ingredients: [
        ingredient(
          'Chicken breast',
          'chicken',
          ['chicken breast', 'pollo', 'pechuga de pollo'],
          150,
          G,
        ),
        rice(100),
      ],
      steps: [
        'Dice the chicken.',
        'Brown the chicken in a non-stick pot over medium heat for 8 minutes, turning it.',
        'Add the rice and 250 ml of water, cover and simmer for 20 minutes.',
      ],
    },
  ],
};
