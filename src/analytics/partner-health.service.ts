import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../common/enums/error-code.enum';
import {
  isSuppressed,
  MIN_DISTINCT_USERS,
  round,
} from '../common/privacy/min-users';
import { Configuration } from '../config/configuration';
import {
  addCalendarDays,
  calendarDaysBetween,
  CalendarDate,
  currentCalendarDate,
  formatCalendarDate,
  parseCalendarDate,
} from '../inventory/inventory-date';
import { PartnerHealthQueryDto } from './dto/partner-health-query.dto';
import {
  FRESHNESS_WINDOW_DAYS,
  MenuStatus,
  PARTNER_HEALTH_CONTRACT_VERSION,
  PartnerHealthAssociationDto,
  PartnerHealthCohortDto,
  PartnerHealthResponseDto,
  PartnerHealthRestaurantDto,
} from './dto/partner-health-response.dto';
import { isConstant, spearman } from './spearman';

const MAX_RANGE_DAYS = 92;
/** Fewer restaurants than this with published values: no association is computed. */
const MIN_ASSOCIATION_SAMPLE = 5;

interface RevisionRow {
  restaurant_id: string;
  name: string;
  category: string;
  last_revision_at: Date | null;
  last_revision_date: string | null;
  revisions_in_range: number;
  synthetic: boolean | null;
}

interface ExposureRow {
  restaurant_id: string;
  exposures: number;
  exposed_users: number;
  selections: number;
  synthetic: boolean | null;
}

interface ReviewRow {
  restaurant_id: string;
  review_count: number;
  reviewers: number;
  sum_overall: number;
  synthetic: boolean | null;
}

interface BoundsRow {
  range_start: Date;
  range_end_exclusive: Date;
}

const invalidRange = (message: string) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message });

/**
 * Sprint 4 / S4-03 — BQ13 (Type 4): "Which restaurant partners keep menus and prices updated
 * within a seven-day window, and does that update frequency correlate with higher student
 * selection rates and review scores?"
 *
 * Sources: menu_revisions (append-only, written only by MenuMaintenance or the synthetic seed),
 * restaurant_reviews, and BQ8 recommendation impressions/selections. Everything is observational.
 */
@Injectable()
export class PartnerHealthService {
  private readonly timezone: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<Configuration, true>,
  ) {
    this.timezone = config.get('app', { infer: true }).timezone;
  }

  async report(
    query: PartnerHealthQueryDto,
    now: Date = new Date(),
  ): Promise<PartnerHealthResponseDto> {
    const from = parseCalendarDate(query.from);
    const to = parseCalendarDate(query.to);
    if (!from || !to) {
      throw invalidRange('from and to must be valid calendar dates');
    }
    const days = calendarDaysBetween(from, to) + 1;
    if (days < 1) {
      throw invalidRange('from must be on or before to');
    }
    if (days > MAX_RANGE_DAYS) {
      throw invalidRange(`the range must not exceed ${MAX_RANGE_DAYS} days`);
    }
    const today = currentCalendarDate(now, this.timezone);
    if (calendarDaysBetween(today, to) > 0) {
      throw invalidRange('to must not be after today (America/Bogota)');
    }
    const includeSynthetic = query.includeSynthetic ?? false;

    const [bounds] = await this.dataSource.query<BoundsRow[]>(
      `SELECT ($1::date::timestamp AT TIME ZONE $3) AS range_start,
              (($2::date + 1)::timestamp AT TIME ZONE $3) AS range_end_exclusive`,
      [query.from, query.to, this.timezone],
    );
    const cutoff = new Date(
      Math.min(now.getTime(), new Date(bounds.range_end_exclusive).getTime()),
    );
    const rangeStart = new Date(bounds.range_start);
    const windowStart = addCalendarDays(to, -(FRESHNESS_WINDOW_DAYS - 1));

    const [revisions, exposures, reviews, historyStart] = await Promise.all([
      this.revisions(rangeStart, cutoff, includeSynthetic),
      this.exposures(rangeStart, cutoff, includeSynthetic),
      this.reviews(query.from, query.to, includeSynthetic),
      this.historyStart(cutoff, includeSynthetic),
    ]);
    const exposureBy = new Map(
      exposures.map((row) => [row.restaurant_id, row]),
    );
    const reviewBy = new Map(reviews.map((row) => [row.restaurant_id, row]));

    const restaurants = revisions.map((row) =>
      this.toRestaurant(
        row,
        exposureBy.get(row.restaurant_id),
        reviewBy.get(row.restaurant_id),
        to,
        windowStart,
      ),
    );

    return {
      contractVersion: PARTNER_HEALTH_CONTRACT_VERSION,
      from: query.from,
      to: query.to,
      cutoff: cutoff.toISOString(),
      freshnessWindow: {
        days: FRESHNESS_WINDOW_DAYS,
        from: formatCalendarDate(windowStart),
        to: query.to,
      },
      generatedAt: new Date().toISOString(),
      includeSynthetic,
      includesSyntheticData: restaurants.some((r) => r.synthetic),
      revisionHistoryStartsAt: historyStart?.toISOString() ?? null,
      minDistinctUsers: MIN_DISTINCT_USERS,
      restaurants,
      cohorts: [MenuStatus.FRESH, MenuStatus.STALE, MenuStatus.UNKNOWN].map(
        (status) => cohort(status, restaurants),
      ),
      associations: [
        association(
          restaurants,
          'selectionRate',
          (r) => r.recommendations.selectionRate,
        ),
        association(restaurants, 'meanOverall', (r) => r.reviews.meanOverall),
      ],
      limitations: [
        'Observational, cross-sectional association: it does not show that menu updates cause more selections or better reviews.',
        'Menu history only exists from the first recorded revision; restaurants without revisions are UNKNOWN, not stale.',
        'Reviews are self-reported by students and do not prove a purchase. The catalog averageRating is not used.',
        'A selection is an in-app choice of a recommended alternative, not a verified visit or order.',
        `Cells with 1-${MIN_DISTINCT_USERS - 1} distinct users are suppressed and excluded from cohort totals.`,
      ],
    };
  }

  private toRestaurant(
    row: RevisionRow,
    exposure: ExposureRow | undefined,
    review: ReviewRow | undefined,
    cutoffDate: CalendarDate,
    windowStart: CalendarDate,
  ): PartnerHealthRestaurantDto {
    const lastDate = row.last_revision_date
      ? parseCalendarDate(row.last_revision_date)
      : null;
    const menuStatus = !lastDate
      ? MenuStatus.UNKNOWN
      : calendarDaysBetween(windowStart, lastDate) >= 0
        ? MenuStatus.FRESH
        : MenuStatus.STALE;

    const exposedUsers = exposure?.exposed_users ?? 0;
    const behaviorSuppressed = isSuppressed(exposedUsers);
    const exposureCount = exposure?.exposures ?? 0;
    const selectionCount = exposure?.selections ?? 0;

    const reviewers = review?.reviewers ?? 0;
    const reviewsSuppressed = isSuppressed(reviewers);
    const reviewCount = review?.review_count ?? 0;

    return {
      restaurantId: row.restaurant_id,
      name: row.name,
      category: row.category,
      menuStatus,
      lastRevisionAt: row.last_revision_at
        ? new Date(row.last_revision_at).toISOString()
        : null,
      lastRevisionDate: row.last_revision_date,
      daysSinceRevision: lastDate
        ? calendarDaysBetween(lastDate, cutoffDate)
        : null,
      revisionsInRange: row.revisions_in_range,
      recommendations: {
        exposures: behaviorSuppressed ? null : exposureCount,
        selections: behaviorSuppressed ? null : selectionCount,
        selectionRate:
          behaviorSuppressed || exposureCount === 0
            ? null
            : round(selectionCount / exposureCount, 4),
        distinctUsers: behaviorSuppressed ? null : exposedUsers,
        suppressed: behaviorSuppressed,
      },
      reviews: {
        reviewCount: reviewsSuppressed ? null : reviewCount,
        distinctReviewers: reviewsSuppressed ? null : reviewers,
        meanOverall:
          reviewsSuppressed || reviewCount === 0
            ? null
            : round(Number(review?.sum_overall ?? 0) / reviewCount),
        suppressed: reviewsSuppressed,
      },
      synthetic:
        row.synthetic === true ||
        exposure?.synthetic === true ||
        review?.synthetic === true,
    };
  }

  /** Every active restaurant, with its revision history up to the cutoff. */
  private revisions(
    rangeStart: Date,
    cutoff: Date,
    includeSynthetic: boolean,
  ): Promise<RevisionRow[]> {
    return this.dataSource.query<RevisionRow[]>(
      `
      SELECT r.id::text AS restaurant_id,
             r.name,
             r.category,
             MAX(mr.changed_at) AS last_revision_at,
             to_char((MAX(mr.changed_at) AT TIME ZONE $4)::date, 'YYYY-MM-DD') AS last_revision_date,
             (COUNT(mr.id) FILTER (WHERE mr.changed_at >= $1))::int AS revisions_in_range,
             BOOL_OR(mr.source = 'SYNTHETIC_SEED') AS synthetic
      FROM restaurants r
      LEFT JOIN menu_revisions mr
        ON mr.restaurant_id = r.id
       AND mr.changed_at < $2
       AND ($3::boolean OR mr.source <> 'SYNTHETIC_SEED')
      WHERE r.active = true
      GROUP BY r.id, r.name, r.category
      ORDER BY r.name ASC, r.id ASC
      `,
      [rangeStart, cutoff, includeSynthetic, this.timezone],
    );
  }

  /**
   * Exposure = a distinct recommendation with a recorded impression in range that offered the
   * restaurant as WALK or ORDER (both alternatives pointing to it count once). Selection = an
   * exposed recommendation whose selected WALK/ORDER alternative is that restaurant.
   */
  private exposures(
    rangeStart: Date,
    cutoff: Date,
    includeSynthetic: boolean,
  ): Promise<ExposureRow[]> {
    return this.dataSource.query<ExposureRow[]>(
      `
      WITH exposed AS (
        SELECT DISTINCT ae.recommendation_id,
                        ae.user_id,
                        ra.metadata -> 'restaurant' ->> 'id' AS restaurant_id,
                        rr.synthetic
        FROM analytics_events ae
        JOIN recommendation_runs rr ON rr.id = ae.recommendation_id
        JOIN recommendation_alternatives ra
          ON ra.recommendation_id = ae.recommendation_id
         AND ra.type IN ('WALK', 'ORDER')
        WHERE ae.event_type = 'RECOMMENDATION_IMPRESSION'
          AND ae.occurred_at >= $1 AND ae.occurred_at < $2
          AND ra.metadata -> 'restaurant' ->> 'id' IS NOT NULL
          AND ($3::boolean OR rr.synthetic = false)
      ),
      selected AS (
        SELECT DISTINCT ae.recommendation_id,
                        ra.metadata -> 'restaurant' ->> 'id' AS restaurant_id
        FROM analytics_events ae
        JOIN recommendation_alternatives ra
          ON ra.recommendation_id = ae.recommendation_id
         AND ra.type = ae.selected_alternative
        WHERE ae.event_type = 'RECOMMENDATION_SELECTED'
          AND ae.selected_alternative IN ('WALK', 'ORDER')
          AND ae.occurred_at >= $1 AND ae.occurred_at < $2
      )
      SELECT e.restaurant_id,
             COUNT(DISTINCT e.recommendation_id)::int AS exposures,
             COUNT(DISTINCT e.user_id)::int AS exposed_users,
             COUNT(DISTINCT s.recommendation_id)::int AS selections,
             BOOL_OR(e.synthetic) AS synthetic
      FROM exposed e
      LEFT JOIN selected s
        ON s.recommendation_id = e.recommendation_id
       AND s.restaurant_id = e.restaurant_id
      GROUP BY e.restaurant_id
      `,
      [rangeStart, cutoff, includeSynthetic],
    );
  }

  private reviews(
    from: string,
    to: string,
    includeSynthetic: boolean,
  ): Promise<ReviewRow[]> {
    return this.dataSource.query<ReviewRow[]>(
      `
      SELECT rv.restaurant_id::text AS restaurant_id,
             COUNT(*)::int AS review_count,
             COUNT(DISTINCT rv.user_id)::int AS reviewers,
             SUM(rv.overall)::int AS sum_overall,
             BOOL_OR(rv.synthetic) AS synthetic
      FROM restaurant_reviews rv
      WHERE rv.review_date BETWEEN $1::date AND $2::date
        AND ($3::boolean OR rv.synthetic = false)
      GROUP BY rv.restaurant_id
      `,
      [from, to, includeSynthetic],
    );
  }

  private async historyStart(
    cutoff: Date,
    includeSynthetic: boolean,
  ): Promise<Date | null> {
    const [row] = await this.dataSource.query<{ first: Date | null }[]>(
      `SELECT MIN(changed_at) AS first FROM menu_revisions
       WHERE changed_at < $1 AND ($2::boolean OR source <> 'SYNTHETIC_SEED')`,
      [cutoff, includeSynthetic],
    );
    return row?.first ? new Date(row.first) : null;
  }
}

/** Pools only published (non-suppressed) cells, so totals never reveal a suppressed restaurant. */
function cohort(
  status: MenuStatus,
  all: PartnerHealthRestaurantDto[],
): PartnerHealthCohortDto {
  const members = all.filter((r) => r.menuStatus === status);
  let exposures = 0;
  let selections = 0;
  let reviewCount = 0;
  let overallSum = 0;
  for (const r of members) {
    if (!r.recommendations.suppressed) {
      exposures += r.recommendations.exposures ?? 0;
      selections += r.recommendations.selections ?? 0;
    }
    if (
      !r.reviews.suppressed &&
      r.reviews.reviewCount &&
      r.reviews.meanOverall !== null
    ) {
      reviewCount += r.reviews.reviewCount;
      overallSum += r.reviews.meanOverall * r.reviews.reviewCount;
    }
  }
  return {
    menuStatus: status,
    restaurants: members.length,
    restaurantsWithSuppressedBehavior: members.filter(
      (r) => r.recommendations.suppressed,
    ).length,
    exposures,
    selections,
    selectionRate: exposures === 0 ? null : round(selections / exposures, 4),
    restaurantsWithSuppressedReviews: members.filter(
      (r) => r.reviews.suppressed,
    ).length,
    reviewCount,
    meanOverall: reviewCount === 0 ? null : round(overallSum / reviewCount),
  };
}

function association(
  restaurants: PartnerHealthRestaurantDto[],
  yName: string,
  pick: (r: PartnerHealthRestaurantDto) => number | null,
): PartnerHealthAssociationDto {
  const pairs = restaurants
    .map((r) => ({ x: r.revisionsInRange, y: pick(r) }))
    .filter((p): p is { x: number; y: number } => p.y !== null);
  const base = {
    x: 'revisionsInRange',
    y: yName,
    method: 'SPEARMAN' as const,
    sampleSize: pairs.length,
  };
  const insufficient = (reason: string): PartnerHealthAssociationDto => ({
    ...base,
    status: 'INSUFFICIENT_DATA',
    coefficient: null,
    reason,
  });
  if (pairs.length < MIN_ASSOCIATION_SAMPLE) {
    return insufficient(
      `needs at least ${MIN_ASSOCIATION_SAMPLE} restaurants with published values`,
    );
  }
  const xs = pairs.map((p) => p.x);
  const ys = pairs.map((p) => p.y);
  if (isConstant(xs) || isConstant(ys)) {
    return insufficient('one of the variables is constant');
  }
  return {
    ...base,
    status: 'COMPUTED',
    coefficient: round(spearman(xs, ys), 4),
    reason: null,
  };
}
