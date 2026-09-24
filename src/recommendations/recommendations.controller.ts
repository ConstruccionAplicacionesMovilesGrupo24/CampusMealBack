import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CompareMealOptionsRequestDto } from './dto/compare-meal-options-request.dto';
import { CompareMealOptionsResponseDto } from './dto/compare-meal-options-response.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('Meal decisions')
@Controller('meal-decisions')
@Auth()
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Post('compare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Compare Cook, Walk and Order alternatives (BQ5)',
    description:
      'The backend owns the entire comparison: scores, ranking, the recommended alternative ' +
      'and the explanation. Mobile clients display this result without recalculating it.',
  })
  @ApiOkResponse({ type: CompareMealOptionsResponseDto })
  compare(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompareMealOptionsRequestDto,
  ): Promise<CompareMealOptionsResponseDto> {
    return this.recommendationsService.compare(user.id, dto);
  }
}
