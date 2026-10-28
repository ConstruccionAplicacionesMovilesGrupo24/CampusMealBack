import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RecipeCatalogResponseDto,
  RecipeDto,
} from './dto/recipe-catalog-response.dto';
import {
  RECIPE_CATALOG_ROW_ID,
  RecipeCatalogRow,
} from './entities/recipe-catalog.entity';
import { CatalogRecipe, RECIPE_CONTRACT_VERSION } from './recipe-catalog.types';

/** Read-only access to the stored recipe catalog (BQ3). Never writes, never filters per user. */
@Injectable()
export class RecipesService {
  private readonly logger = new Logger(RecipesService.name);

  constructor(
    @InjectRepository(RecipeCatalogRow)
    private readonly catalogs: Repository<RecipeCatalogRow>,
  ) {}

  async getCatalog(): Promise<RecipeCatalogResponseDto> {
    const row = await this.catalogs.findOneBy({ id: RECIPE_CATALOG_ROW_ID });
    if (!row) {
      // Missing seed is not the same as a valid empty catalog (a stored row with no recipes).
      this.logger.warn('Recipe catalog row is missing; run the recipes seed');
      throw new ServiceUnavailableException(
        'The recipe catalog is not available yet',
      );
    }

    return {
      contractVersion: RECIPE_CONTRACT_VERSION,
      catalogVersion: row.catalogVersion,
      generatedAt: row.generatedAt.toISOString(),
      recipes: row.recipes.map(toRecipeDto),
    };
  }
}

// Explicit mapping keeps the response limited to contract fields, in a stable order.
function toRecipeDto(recipe: CatalogRecipe): RecipeDto {
  return {
    id: recipe.id,
    name: recipe.name,
    preparationMinutes: recipe.preparationMinutes,
    servings: recipe.servings,
    dietaryTags: recipe.dietaryTags,
    ingredients: recipe.ingredients.map((ingredient) => ({
      name: ingredient.name,
      normalizedName: ingredient.normalizedName,
      aliases: ingredient.aliases ?? [],
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      optional: ingredient.optional,
    })),
    steps: recipe.steps,
  };
}
