import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isSuppressed, round } from '../common/privacy/min-users';
import { Configuration } from '../config/configuration';
import {
  currentCalendarDate,
  formatCalendarDate,
} from '../inventory/inventory-date';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewListQueryDto } from './dto/review-list-query.dto';
import {
  RestaurantReviewsResponseDto,
  REVIEWS_CONTRACT_VERSION,
  ReviewReceiptDto,
} from './dto/review-response.dto';
import { RestaurantReview } from './entities/restaurant-review.entity';
import {
  clientReviewIdConflict,
  restaurantNotFound,
  reviewAlreadySubmittedToday,
  reviewOccurredAtOutOfRange,
} from './reviews-errors';

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
/** An offline review may wait in the Android outbox; older observations are refused. */
export const MAX_REVIEW_AGE_DAYS = 30;
const DEFAULT_LIMIT = 20;

export interface ReviewCreation {
  receipt: ReviewReceiptDto;
  /** False for an idempotent replay of an already stored review. */
  created: boolean;
}

interface SummaryRow {
  review_count: number;
  reviewers: number;
  mean_overall: number | null;
  mean_portion: number | null;
  mean_taste: number | null;
  mean_freshness: number | null;
  mean_value: number | null;
  mean_wait: number | null;
  any_synthetic: boolean | null;
}

interface RecentRow {
  review_date: string;
  overall: number;
  portion: number;
  taste: number;
  freshness: number;
  value: number;
  wait_minutes: number;
}

/** Sprint 4 / S4-03: structured restaurant reviews (BQ13 input). */
@Injectable()
export class ReviewsService {
  private readonly timezone: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<Configuration, true>,
  ) {
    this.timezone = config.get('app', { infer: true }).timezone;
  }

  /**
   * Idempotent per author by `clientReviewId`:
   * - first time: stored, `created = true` (201);
   * - same id and same content again (lost acknowledgement): the stored review, `created = false` (200);
   * - same id, different content: 409 CLIENT_REVIEW_ID_CONFLICT;
   * - another id for the same restaurant and Bogotá day: 409 REVIEW_ALREADY_SUBMITTED_TODAY.
   * Both uniqueness rules are enforced by unique indexes, so concurrent replays cannot create two rows.
   */
  async create(
    userId: string,
    restaurantId: string,
    dto: CreateReviewDto,
    now: Date = new Date(),
  ): Promise<ReviewCreation> {
    const restaurant = await this.dataSource
      .getRepository(Restaurant)
      .findOneBy({ id: restaurantId, active: true });
    if (!restaurant) {
      throw restaurantNotFound();
    }

    const occurredAt = new Date(dto.occurredAt);
    const oldest = now.getTime() - MAX_REVIEW_AGE_DAYS * 24 * 60 * 60 * 1000;
    if (
      occurredAt.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS ||
      occurredAt.getTime() < oldest
    ) {
      throw reviewOccurredAtOutOfRange(MAX_REVIEW_AGE_DAYS);
    }

    const reviews = this.dataSource.getRepository(RestaurantReview);
    const existing = await reviews.findOneBy({
      userId,
      clientReviewId: dto.clientReviewId,
    });
    if (existing) {
      return this.replay(existing, restaurantId, dto);
    }

    const reviewDate = formatCalendarDate(
      currentCalendarDate(occurredAt, this.timezone),
    );
    const inserted = await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(RestaurantReview)
      .values({
        clientReviewId: dto.clientReviewId,
        userId,
        restaurantId,
        overall: dto.overall,
        portion: dto.portion,
        taste: dto.taste,
        freshness: dto.freshness,
        value: dto.value,
        waitMinutes: dto.waitMinutes,
        occurredAt,
        reviewDate,
        synthetic: false,
      })
      .orIgnore()
      .returning(['id'])
      .execute();

    if ((inserted.raw as unknown[]).length === 1) {
      const stored = await reviews.findOneByOrFail({
        userId,
        clientReviewId: dto.clientReviewId,
      });
      return { receipt: toReceipt(stored), created: true };
    }

    // Nothing inserted: a concurrent replay of the same id won the race, or the day is taken.
    const raced = await reviews.findOneBy({
      userId,
      clientReviewId: dto.clientReviewId,
    });
    if (raced) {
      return this.replay(raced, restaurantId, dto);
    }
    throw reviewAlreadySubmittedToday();
  }

  async list(
    restaurantId: string,
    query: ReviewListQueryDto,
  ): Promise<RestaurantReviewsResponseDto> {
    const restaurant = await this.dataSource
      .getRepository(Restaurant)
      .findOneBy({ id: restaurantId, active: true });
    if (!restaurant) {
      throw restaurantNotFound();
    }
    const includeSynthetic = query.includeSynthetic ?? false;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const [summary] = await this.dataSource.query<SummaryRow[]>(
      `
      SELECT
        COUNT(*)::int AS review_count,
        COUNT(DISTINCT r.user_id)::int AS reviewers,
        AVG(r.overall)::float AS mean_overall,
        AVG(r.portion)::float AS mean_portion,
        AVG(r.taste)::float AS mean_taste,
        AVG(r.freshness)::float AS mean_freshness,
        AVG(r.value)::float AS mean_value,
        AVG(r.wait_minutes)::float AS mean_wait,
        BOOL_OR(r.synthetic) AS any_synthetic
      FROM restaurant_reviews r
      WHERE r.restaurant_id = $1
        AND ($2::boolean OR r.synthetic = false)
      `,
      [restaurantId, includeSynthetic],
    );

    const suppressed = isSuppressed(summary.reviewers);
    const publish = (value: number | null) =>
      suppressed ? null : round(value);

    const recent = suppressed
      ? []
      : await this.dataSource.query<RecentRow[]>(
          `
          SELECT to_char(r.review_date, 'YYYY-MM-DD') AS review_date,
                 r.overall, r.portion, r.taste, r.freshness, r.value, r.wait_minutes
          FROM restaurant_reviews r
          WHERE r.restaurant_id = $1
            AND ($2::boolean OR r.synthetic = false)
          ORDER BY r.review_date DESC, r.created_at DESC, r.id ASC
          LIMIT $3
          `,
          [restaurantId, includeSynthetic, limit],
        );

    return {
      contractVersion: REVIEWS_CONTRACT_VERSION,
      restaurantId,
      generatedAt: new Date().toISOString(),
      includeSynthetic,
      includesSyntheticData: summary.any_synthetic === true,
      summary: {
        source: 'STUDENT_SELF_REPORTED',
        reviewCount: suppressed ? null : summary.review_count,
        distinctReviewers: suppressed ? null : summary.reviewers,
        suppressed,
        meanOverall: publish(summary.mean_overall),
        meanPortion: publish(summary.mean_portion),
        meanTaste: publish(summary.mean_taste),
        meanFreshness: publish(summary.mean_freshness),
        meanValue: publish(summary.mean_value),
        meanWaitMinutes: publish(summary.mean_wait),
      },
      recent: recent.map((row) => ({
        reviewDate: row.review_date,
        overall: row.overall,
        portion: row.portion,
        taste: row.taste,
        freshness: row.freshness,
        value: row.value,
        waitMinutes: row.wait_minutes,
      })),
      catalogRating: {
        value: restaurant.averageRating,
        provenance: 'CATALOG_SEED',
      },
    };
  }

  private replay(
    stored: RestaurantReview,
    restaurantId: string,
    dto: CreateReviewDto,
  ): ReviewCreation {
    const same =
      stored.restaurantId === restaurantId &&
      stored.overall === dto.overall &&
      stored.portion === dto.portion &&
      stored.taste === dto.taste &&
      stored.freshness === dto.freshness &&
      stored.value === dto.value &&
      stored.waitMinutes === dto.waitMinutes &&
      stored.occurredAt.getTime() === new Date(dto.occurredAt).getTime();
    if (!same) {
      throw clientReviewIdConflict();
    }
    return { receipt: toReceipt(stored), created: false };
  }
}

function toReceipt(review: RestaurantReview): ReviewReceiptDto {
  return {
    contractVersion: REVIEWS_CONTRACT_VERSION,
    reviewId: review.id,
    clientReviewId: review.clientReviewId,
    restaurantId: review.restaurantId,
    reviewDate: review.reviewDate,
    createdAt: review.createdAt.toISOString(),
  };
}
