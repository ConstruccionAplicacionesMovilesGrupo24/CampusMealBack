import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { ErrorCode } from '../common/enums/error-code.enum';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewListQueryDto } from './dto/review-list-query.dto';
import {
  RestaurantReviewsResponseDto,
  ReviewReceiptDto,
} from './dto/review-response.dto';
import { ReviewsService } from './reviews.service';

const PATH = '/api/v1/restaurants/{restaurantId}/reviews';

@ApiTags('Restaurant reviews')
@Controller('restaurants/:restaurantId/reviews')
@Auth()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ApiOperation({
    summary: 'Submit a structured review (S4-03, BQ13)',
    description:
      'Scores 1-5 for overall, portion, taste, freshness and value, plus observed waiting minutes. ' +
      'Self-reported: it does not prove a purchase. The author is the authenticated user. ' +
      'Idempotent by clientReviewId: 201 when stored, 200 with the same body when the same review is re-sent. ' +
      'One review per user, restaurant and America/Bogota day.',
  })
  @ApiCreatedResponse({ type: ReviewReceiptDto, description: 'Stored.' })
  @ApiOkResponse({
    type: ReviewReceiptDto,
    description: 'Idempotent replay: this review was already stored.',
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    PATH,
    {
      code: ErrorCode.REVIEW_ALREADY_SUBMITTED_TODAY,
      message:
        'You already reviewed this restaurant on this day (America/Bogota)',
    },
    {
      code: ErrorCode.CLIENT_REVIEW_ID_CONFLICT,
      message:
        'clientReviewId was already used for a different review; generate a new id',
    },
  )
  @ApiErrorResponse(HttpStatus.NOT_FOUND, PATH, {
    code: ErrorCode.RESTAURANT_NOT_FOUND,
    message: 'Restaurant not found',
  })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, PATH, {
    code: ErrorCode.VALIDATION_ERROR,
    message: 'occurredAt must not be in the future nor older than 30 days',
  })
  async create(
    @CurrentUser('id') userId: string,
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @Body() dto: CreateReviewDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReviewReceiptDto> {
    const { receipt, created } = await this.reviewsService.create(
      userId,
      restaurantId,
      dto,
    );
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return receipt;
  }

  @Get()
  @ApiOperation({
    summary: 'Review summary and recent reviews of a restaurant (S4-03)',
    description:
      'No author is returned. With 1-4 distinct reviewers every value is withheld (suppressed). ' +
      'The catalog rating is reported separately and never mixed with review means. ' +
      'Synthetic demo reviews are excluded unless includeSynthetic=true.',
  })
  @ApiOkResponse({ type: RestaurantReviewsResponseDto })
  @ApiErrorResponse(HttpStatus.NOT_FOUND, PATH, {
    code: ErrorCode.RESTAURANT_NOT_FOUND,
    message: 'Restaurant not found',
  })
  list(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
    @Query() query: ReviewListQueryDto,
  ): Promise<RestaurantReviewsResponseDto> {
    return this.reviewsService.list(restaurantId, query);
  }
}
