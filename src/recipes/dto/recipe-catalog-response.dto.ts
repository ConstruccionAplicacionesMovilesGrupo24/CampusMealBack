import { ApiProperty } from '@nestjs/swagger';
import { DietaryTag } from '../../restaurants/enums/dietary-tag.enum';
import {
  RECIPE_CONTRACT_VERSION,
  RECIPE_LIMITS,
  RecipeUnit,
} from '../recipe-catalog.types';

export class RecipeIngredientDto {
  @ApiProperty({ example: 'Spinach', description: 'Display name.' })
  name: string;

  @ApiProperty({
    example: 'spinach',
    description:
      'Matching key: lowercase, trimmed, accents removed, single spaces. Inventory names normalized the same way must equal it or an alias.',
  })
  normalizedName: string;

  @ApiProperty({
    type: [String],
    example: ['baby spinach', 'espinaca', 'espinacas'],
    description: 'Extra normalized matching keys. Always present; may be [].',
  })
  aliases: string[];

  @ApiProperty({
    example: 50,
    exclusiveMinimum: true,
    minimum: 0,
    description:
      'Amount for the whole recipe yield (`servings`), > 0. No implicit scaling.',
  })
  quantity: number;

  @ApiProperty({ enum: RecipeUnit, enumName: 'RecipeUnit', example: 'g' })
  unit: RecipeUnit;

  @ApiProperty({
    example: false,
    description: 'Optional ingredients never prevent a recipe from matching.',
  })
  optional: boolean;
}

export class RecipeDto {
  @ApiProperty({
    format: 'uuid',
    example: 'acc8498d-c078-42b9-980a-ab8a10e4755f',
    description: 'Stable across catalog versions while the recipe exists.',
  })
  id: string;

  @ApiProperty({
    example: 'Spinach omelette',
    minLength: 1,
    maxLength: RECIPE_LIMITS.nameMaxLength,
  })
  name: string;

  @ApiProperty({
    example: 15,
    minimum: RECIPE_LIMITS.minPreparationMinutes,
    maximum: RECIPE_LIMITS.maxPreparationMinutes,
  })
  preparationMinutes: number;

  @ApiProperty({
    example: 1,
    minimum: RECIPE_LIMITS.minServings,
    maximum: RECIPE_LIMITS.maxServings,
    description: 'Yield of the listed quantities.',
  })
  servings: number;

  @ApiProperty({
    enum: DietaryTag,
    enumName: 'DietaryTag',
    isArray: true,
    example: [DietaryTag.VEGETARIAN, DietaryTag.GLUTEN_FREE],
    description: 'Assigned by the catalog author. May be [].',
  })
  dietaryTags: DietaryTag[];

  @ApiProperty({
    type: [RecipeIngredientDto],
    minItems: 1,
    maxItems: RECIPE_LIMITS.maxIngredients,
  })
  ingredients: RecipeIngredientDto[];

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: RECIPE_LIMITS.maxSteps,
    example: [
      'Beat the eggs.',
      'Cook the spinach in a non-stick pan for 2 minutes.',
      'Pour in the eggs, add the cheese if you have it, and cook until set.',
    ],
  })
  steps: string[];
}

export class RecipeCatalogResponseDto {
  @ApiProperty({
    example: RECIPE_CONTRACT_VERSION,
    enum: [RECIPE_CONTRACT_VERSION],
    description: 'Response shape version.',
  })
  contractVersion: number;

  @ApiProperty({
    example: '2026-10-27.1',
    description:
      'Changes whenever any recipe or matching field changes. Part of the client cache key.',
  })
  catalogVersion: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-10-27T12:00:00.000Z',
    description:
      'When this catalog version was produced (UTC). Not the request or sync time.',
  })
  generatedAt: string;

  @ApiProperty({
    type: [RecipeDto],
    maxItems: RECIPE_LIMITS.maxRecipes,
    description: 'The complete catalog, unfiltered. May be [].',
  })
  recipes: RecipeDto[];
}
