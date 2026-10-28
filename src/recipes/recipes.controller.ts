import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { ErrorCode } from '../common/enums/error-code.enum';
import { RecipeCatalogQueryDto } from './dto/recipe-catalog-query.dto';
import { RecipeCatalogResponseDto } from './dto/recipe-catalog-response.dto';
import { RecipesService } from './recipes.service';

@ApiTags('Recipes')
@Controller('recipes')
@Auth()
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  @ApiOperation({
    summary: 'BQ3: the complete recipe catalog',
    description:
      'Any authenticated active user (USER or ANALYST). Returns every recipe, unfiltered: clients evaluate BQ3 ' +
      'locally against the complete inventory (GET /inventory), dietary preferences and maximum preparation time. ' +
      'catalogVersion and generatedAt identify the catalog content and stay the same across requests and restarts. ' +
      'Contract version 1 accepts no query parameters. A stored catalog without recipes returns `"recipes": []`; ' +
      'a database without a seeded catalog returns 503.',
  })
  @ApiOkResponse({ type: RecipeCatalogResponseDto })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, '/api/v1/recipes', {
    code: ErrorCode.VALIDATION_ERROR,
    message: 'property limit should not exist',
  })
  @ApiErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, '/api/v1/recipes', {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
  })
  @ApiErrorResponse(HttpStatus.SERVICE_UNAVAILABLE, '/api/v1/recipes', {
    code: ErrorCode.SERVICE_UNAVAILABLE,
    message: 'The recipe catalog is not available yet',
  })
  getCatalog(
    @Query() query: RecipeCatalogQueryDto,
  ): Promise<RecipeCatalogResponseDto> {
    // The query DTO is empty on purpose: binding it makes ValidationPipe reject any parameter.
    void query;
    return this.recipesService.getCatalog();
  }
}
