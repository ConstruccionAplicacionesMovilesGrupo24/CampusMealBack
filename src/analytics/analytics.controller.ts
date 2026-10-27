import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { ErrorCode } from '../common/enums/error-code.enum';
import { UserRole } from '../users/enums/user-role.enum';
import { AnalyticsService } from './analytics.service';
import { CreateAnalyticsEventDto } from './dto/create-analytics-event.dto';
import { CreateUsageEventDto } from './dto/create-usage-event.dto';
import { ExplanationSelectionQueryDto } from './dto/explanation-selection-query.dto';
import { ExplanationSelectionResponseDto } from './dto/explanation-selection-response.dto';
import { FeatureAdoptionQueryDto } from './dto/feature-adoption-query.dto';
import { FeatureAdoptionResponseDto } from './dto/feature-adoption-response.dto';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('events')
  @Auth()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Record a recommendation impression or selection',
    description:
      'Idempotent by `clientEventId`: a retry returns 202 again but is stored once. ' +
      'The recommendation must belong to the authenticated user. Clients never send the explanation category.',
  })
  @ApiAcceptedResponse({ description: 'Event accepted (empty body).' })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, '/api/v1/analytics/events', {
    code: ErrorCode.VALIDATION_ERROR,
    message:
      'selectedAlternative must be one of COOK, WALK, ORDER for RECOMMENDATION_SELECTED',
  })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, '/api/v1/analytics/events', {
    code: ErrorCode.RECOMMENDATION_NOT_FOUND,
    message: 'Recommendation not found',
  })
  async recordEvent(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAnalyticsEventDto,
  ): Promise<void> {
    await this.analyticsService.recordEvent(userId, dto);
  }

  @Get('explanation-selection')
  @Auth(UserRole.ANALYST)
  @ApiOperation({
    summary:
      'BQ8: selection rate per recommendation explanation (ANALYST only)',
    description:
      'selectionRate = distinct recommendations selected ÷ distinct recommendations displayed, ' +
      'per explanation type stored on the recommendation. `from`/`to` are inclusive dates in America/Bogota. ' +
      'Ordered by selectionRate descending.',
  })
  @ApiOkResponse({ type: ExplanationSelectionResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    '/api/v1/analytics/explanation-selection',
    {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'from must be on or before to',
    },
  )
  explanationSelection(
    @Query() query: ExplanationSelectionQueryDto,
  ): Promise<ExplanationSelectionResponseDto> {
    return this.analyticsService.explanationSelection(query);
  }

  @Post('usage-events')
  @Auth()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Record a product usage event (BQ6)',
    description:
      'Idempotent per account by `clientEventId`: a retry or outbox replay returns 202 again but is stored once. ' +
      '`SESSION_STARTED` takes no feature; `FEATURE_USED` requires one. `occurredAt` (UTC) decides the month ' +
      'the event counts in, so late syncs are attributed to when they happened. It must not be in the future ' +
      'nor older than 90 days. No coordinates or free text are accepted.',
  })
  @ApiAcceptedResponse({ description: 'Event accepted (empty body).' })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, '/api/v1/analytics/usage-events', {
    code: ErrorCode.VALIDATION_ERROR,
    message: 'feature must be one of INVENTORY, RECIPES, ... for FEATURE_USED',
  })
  async recordUsageEvent(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateUsageEventDto,
  ): Promise<void> {
    await this.analyticsService.recordUsageEvent(userId, dto);
  }

  @Get('feature-adoption')
  @Auth(UserRole.ANALYST)
  @ApiOperation({
    summary:
      'BQ6: core features used fewer than two times per month by at least 80% of monthly active users (ANALYST only)',
    description:
      'MAU = accounts with at least one valid usage event in the month (America/Bogota). For each feature, ' +
      'lowUseRate = MAU with fewer than 2 FEATURE_USED events ÷ MAU, counting users with zero uses. ' +
      '`flagged` is true when lowUseRate >= 0.80. A month without active users returns status NO_DATA.',
  })
  @ApiOkResponse({ type: FeatureAdoptionResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    '/api/v1/analytics/feature-adoption',
    {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'month must be in YYYY-MM format',
    },
  )
  featureAdoption(
    @Query() query: FeatureAdoptionQueryDto,
  ): Promise<FeatureAdoptionResponseDto> {
    return this.analyticsService.featureAdoption(query);
  }
}
