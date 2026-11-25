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
import { CreatePerformanceEventDto } from './dto/create-performance-event.dto';
import { CreateUsageEventDto } from './dto/create-usage-event.dto';
import { ExplanationSelectionQueryDto } from './dto/explanation-selection-query.dto';
import { ExplanationSelectionResponseDto } from './dto/explanation-selection-response.dto';
import { FeatureAdoptionQueryDto } from './dto/feature-adoption-query.dto';
import { FeatureAdoptionResponseDto } from './dto/feature-adoption-response.dto';
import { ZoneDemandQueryDto } from './dto/zone-demand-query.dto';
import { ZoneDemandResponseDto } from './dto/zone-demand-response.dto';
import { PartnerHealthQueryDto } from './dto/partner-health-query.dto';
import { PartnerHealthResponseDto } from './dto/partner-health-response.dto';
import { PartnerHealthService } from './partner-health.service';
import { PerformanceQueryDto } from './dto/performance-query.dto';
import { PerformanceResponseDto } from './dto/performance-response.dto';
import { PerformanceService } from './performance.service';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly partnerHealthService: PartnerHealthService,
    private readonly performanceService: PerformanceService,
  ) {}

  @Get('partner-health')
  @Auth(UserRole.ANALYST)
  @ApiOperation({
    summary:
      'BQ13: menu freshness versus selection rate and review scores (ANALYST only)',
    description:
      '`from`/`to` are inclusive America/Bogota dates (at most 92 days, `to` not after today); `to` is the cutoff date. ' +
      'menuStatus FRESH = a recorded menu/price revision within the 7 calendar days ending at `to`; STALE = older revisions only; ' +
      'UNKNOWN = no revision recorded. Exposure = distinct displayed recommendation offering the restaurant as WALK/ORDER; ' +
      'selectionRate = selections ÷ exposures. Reviews are self-reported. Cells with 1-4 distinct users are suppressed and ' +
      'left out of cohort totals. Spearman association only with ≥5 restaurants and non-constant values; observational only.',
  })
  @ApiOkResponse({ type: PartnerHealthResponseDto })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    '/api/v1/analytics/partner-health',
    {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'from must be on or before to',
    },
  )
  partnerHealth(
    @Query() query: PartnerHealthQueryDto,
  ): Promise<PartnerHealthResponseDto> {
    return this.partnerHealthService.report(query);
  }

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

  @Get('zone-demand')
  @Auth(UserRole.ANALYST)
  @ApiOperation({
    summary: 'BQ9: demand for each zone (ANALYST only)',
    description:
      'Returns aggregated restaurant demand indicators by zone, meal category, budget/price range and hour. ' +
      '`from`/`to` are inclusive dates in America/Bogota. ' +
      'Cells with fewer than five distinct users are suppressed.',
  })
  @ApiOkResponse({ type: ZoneDemandResponseDto })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, '/api/v1/analytics/zone-demand', {
    code: ErrorCode.VALIDATION_ERROR,
    message:
      'from must be on or before to and the range must not exceed 92 days',
  })
  zoneDemand(
    @Query() query: ZoneDemandQueryDto,
  ): Promise<ZoneDemandResponseDto> {
    return this.analyticsService.zoneDemand(query);
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

  @Post('performance-events')
  @Auth()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Record a session, fatal crash or comparison load (BQ1)',
    description:
      'Idempotent per account by `clientEventId`; a session start, a session crash and a load are also stored once each. ' +
      'SESSION_START and FATAL_CRASH require `sessionId`; COMPARISON_LOAD requires `loadId` and `outcome` (and `durationMs` when ' +
      'content was shown). Fields of another type are rejected. `occurredAt` (UTC) decides the report window, so late syncs count ' +
      'when they happened; at most 5 minutes in the future and 90 days old. No coordinates, stack traces or exception messages.',
  })
  @ApiAcceptedResponse({ description: 'Event accepted (empty body).' })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    '/api/v1/analytics/performance-events',
    {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'durationMs is not allowed for SESSION_START',
    },
  )
  async recordPerformanceEvent(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePerformanceEventDto,
  ): Promise<void> {
    await this.performanceService.record(userId, dto);
  }

  @Get('performance')
  @Auth(UserRole.ANALYST)
  @ApiOperation({
    summary:
      'BQ1: crash rate above 1% or comparison p95 above 2 s per device, OS and app version (ANALYST only)',
    description:
      'crashRate = started sessions with a captured fatal crash ÷ started sessions. p95 = nearest-rank over FRESH_NETWORK loads. ' +
      'Flags are strictly above 0.01 / 2000 ms; empty samples are null and small ones are labelled INSUFFICIENT. ' +
      '`from`/`to` are inclusive America/Bogota dates (at most 92 days). Demo rows and injected crashes only with includeSynthetic=true.',
  })
  @ApiOkResponse({ type: PerformanceResponseDto })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, '/api/v1/analytics/performance', {
    code: ErrorCode.VALIDATION_ERROR,
    message: 'from must be on or before to',
  })
  performance(
    @Query() query: PerformanceQueryDto,
  ): Promise<PerformanceResponseDto> {
    return this.performanceService.report(query);
  }
}
