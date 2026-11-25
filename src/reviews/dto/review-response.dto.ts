import { ApiProperty } from '@nestjs/swagger';

export const REVIEWS_CONTRACT_VERSION = 1;

/** Answer of `POST restaurants/:restaurantId/reviews` (201 created, 200 idempotent replay). */
export class ReviewReceiptDto {
  @ApiProperty({ example: REVIEWS_CONTRACT_VERSION })
  contractVersion: number;

  @ApiProperty()
  reviewId: string;

  @ApiProperty()
  clientReviewId: string;

  @ApiProperty()
  restaurantId: string;

  @ApiProperty({ example: '2026-11-23', description: 'America/Bogota date.' })
  reviewDate: string;

  @ApiProperty({ description: 'When the backend first stored the review.' })
  createdAt: string;
}

export class ReviewSummaryDto {
  @ApiProperty({ example: 'STUDENT_SELF_REPORTED' })
  source: 'STUDENT_SELF_REPORTED';

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '0 when there are no reviews; null when suppressed.',
  })
  reviewCount: number | null;

  @ApiProperty({ type: Number, nullable: true })
  distinctReviewers: number | null;

  @ApiProperty({
    description: 'True with 1-4 distinct reviewers: every value is withheld.',
  })
  suppressed: boolean;

  @ApiProperty({ type: Number, nullable: true })
  meanOverall: number | null;

  @ApiProperty({ type: Number, nullable: true })
  meanPortion: number | null;

  @ApiProperty({ type: Number, nullable: true })
  meanTaste: number | null;

  @ApiProperty({ type: Number, nullable: true })
  meanFreshness: number | null;

  @ApiProperty({ type: Number, nullable: true })
  meanValue: number | null;

  @ApiProperty({ type: Number, nullable: true })
  meanWaitMinutes: number | null;
}

/** One review as shown publicly: day granularity, no author, no time of day. */
export class PublicReviewDto {
  @ApiProperty({ example: '2026-11-22' })
  reviewDate: string;

  @ApiProperty()
  overall: number;

  @ApiProperty()
  portion: number;

  @ApiProperty()
  taste: number;

  @ApiProperty()
  freshness: number;

  @ApiProperty()
  value: number;

  @ApiProperty()
  waitMinutes: number;
}

export class CatalogRatingDto {
  @ApiProperty({ example: 4.6 })
  value: number;

  @ApiProperty({
    example: 'CATALOG_SEED',
    description:
      'The restaurant catalog rating loaded with the demo data. It is not computed from reviews.',
  })
  provenance: 'CATALOG_SEED';
}

export class RestaurantReviewsResponseDto {
  @ApiProperty({ example: REVIEWS_CONTRACT_VERSION })
  contractVersion: number;

  @ApiProperty()
  restaurantId: string;

  @ApiProperty()
  generatedAt: string;

  @ApiProperty({ description: 'Echo of the includeSynthetic query parameter.' })
  includeSynthetic: boolean;

  @ApiProperty({
    description: 'True when synthetic seed reviews contributed to this answer.',
  })
  includesSyntheticData: boolean;

  @ApiProperty({ type: ReviewSummaryDto })
  summary: ReviewSummaryDto;

  @ApiProperty({
    type: [PublicReviewDto],
    description: 'Newest first. Empty while the summary is suppressed.',
  })
  recent: PublicReviewDto[];

  @ApiProperty({ type: CatalogRatingDto })
  catalogRating: CatalogRatingDto;
}
