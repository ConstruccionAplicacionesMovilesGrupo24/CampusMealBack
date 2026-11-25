import { ApiProperty } from '@nestjs/swagger';

export const PARTNER_HEALTH_CONTRACT_VERSION = 1;
export const FRESHNESS_WINDOW_DAYS = 7;

export enum MenuStatus {
  /** A confirmed revision within the 7 Bogotá calendar days ending at the cutoff date. */
  FRESH = 'FRESH',
  /** Revisions exist, but the last one is older than that window. */
  STALE = 'STALE',
  /** No revision recorded up to the cutoff: update history unknown. */
  UNKNOWN = 'UNKNOWN',
}

export class FreshnessWindowDto {
  @ApiProperty({ example: FRESHNESS_WINDOW_DAYS })
  days: number;

  @ApiProperty({ example: '2026-11-14' })
  from: string;

  @ApiProperty({ example: '2026-11-20' })
  to: string;
}

export class RecommendationBehaviorDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Distinct recommendations displayed (impression) that offered this restaurant as WALK or ORDER. Null when suppressed.',
  })
  exposures: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Exposed recommendations in which this restaurant was selected.',
  })
  selections: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'selections ÷ exposures; null when exposures is 0 or suppressed.',
  })
  selectionRate: number | null;

  @ApiProperty({ type: Number, nullable: true })
  distinctUsers: number | null;

  @ApiProperty({ description: 'True with 1-4 distinct exposed users.' })
  suppressed: boolean;
}

export class ReviewAggregateDto {
  @ApiProperty({ type: Number, nullable: true })
  reviewCount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  distinctReviewers: number | null;

  @ApiProperty({ type: Number, nullable: true })
  meanOverall: number | null;

  @ApiProperty({ description: 'True with 1-4 distinct reviewers.' })
  suppressed: boolean;
}

export class PartnerHealthRestaurantDto {
  @ApiProperty()
  restaurantId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty({ enum: MenuStatus })
  menuStatus: MenuStatus;

  @ApiProperty({ type: String, nullable: true })
  lastRevisionAt: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-11-19' })
  lastRevisionDate: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Calendar days from the last revision to the cutoff date.',
  })
  daysSinceRevision: number | null;

  @ApiProperty({ description: 'Revisions with changedAt inside [from, to].' })
  revisionsInRange: number;

  @ApiProperty({ type: RecommendationBehaviorDto })
  recommendations: RecommendationBehaviorDto;

  @ApiProperty({ type: ReviewAggregateDto })
  reviews: ReviewAggregateDto;

  @ApiProperty({
    description: 'Synthetic rows contributed to this restaurant.',
  })
  synthetic: boolean;
}

export class PartnerHealthCohortDto {
  @ApiProperty({ enum: MenuStatus })
  menuStatus: MenuStatus;

  @ApiProperty()
  restaurants: number;

  @ApiProperty({
    description:
      'Restaurants whose behavior cell is suppressed; their values are NOT part of the pooled numbers.',
  })
  restaurantsWithSuppressedBehavior: number;

  @ApiProperty()
  exposures: number;

  @ApiProperty()
  selections: number;

  @ApiProperty({ type: Number, nullable: true })
  selectionRate: number | null;

  @ApiProperty({
    description:
      'Restaurants whose review cell is suppressed; their reviews are NOT part of the pooled numbers.',
  })
  restaurantsWithSuppressedReviews: number;

  @ApiProperty()
  reviewCount: number;

  @ApiProperty({ type: Number, nullable: true })
  meanOverall: number | null;
}

export class PartnerHealthAssociationDto {
  @ApiProperty({ example: 'revisionsInRange' })
  x: string;

  @ApiProperty({ example: 'selectionRate' })
  y: string;

  @ApiProperty({ example: 'SPEARMAN' })
  method: 'SPEARMAN';

  @ApiProperty({ enum: ['COMPUTED', 'INSUFFICIENT_DATA'] })
  status: 'COMPUTED' | 'INSUFFICIENT_DATA';

  @ApiProperty({ type: Number, nullable: true })
  coefficient: number | null;

  @ApiProperty({
    description: 'Restaurants with a published value for x and y.',
  })
  sampleSize: number;

  @ApiProperty({ type: String, nullable: true })
  reason: string | null;
}

export class PartnerHealthResponseDto {
  @ApiProperty({ example: PARTNER_HEALTH_CONTRACT_VERSION })
  contractVersion: number;

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty({
    description:
      'Exclusive instant: data at or after it is not counted (end of `to`, or now when `to` is today).',
  })
  cutoff: string;

  @ApiProperty({ type: FreshnessWindowDto })
  freshnessWindow: FreshnessWindowDto;

  @ApiProperty()
  generatedAt: string;

  @ApiProperty()
  includeSynthetic: boolean;

  @ApiProperty()
  includesSyntheticData: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'First recorded menu revision among the counted rows. Before it, update history is unknown.',
  })
  revisionHistoryStartsAt: string | null;

  @ApiProperty({ example: 5 })
  minDistinctUsers: number;

  @ApiProperty({ type: [PartnerHealthRestaurantDto] })
  restaurants: PartnerHealthRestaurantDto[];

  @ApiProperty({ type: [PartnerHealthCohortDto] })
  cohorts: PartnerHealthCohortDto[];

  @ApiProperty({ type: [PartnerHealthAssociationDto] })
  associations: PartnerHealthAssociationDto[];

  @ApiProperty({ type: [String] })
  limitations: string[];
}
