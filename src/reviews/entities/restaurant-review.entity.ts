import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Restaurant } from '../../restaurants/entities/restaurant.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Sprint 4 / S4-03 (BQ13): one structured, self-reported student review of a restaurant.
 *
 * No free text is stored, so there is nothing to moderate. A review does not prove a purchase.
 * The author comes from the access token and is never returned by public reads.
 * At most one review per author, restaurant and Bogotá calendar day; `clientReviewId` makes an
 * offline replay idempotent.
 */
@Entity({ name: 'restaurant_reviews' })
@Index(
  'UQ_restaurant_reviews_user_client_review',
  ['userId', 'clientReviewId'],
  {
    unique: true,
  },
)
@Index(
  'UQ_restaurant_reviews_user_restaurant_day',
  ['userId', 'restaurantId', 'reviewDate'],
  { unique: true },
)
@Index('IDX_restaurant_reviews_restaurant_date', ['restaurantId', 'reviewDate'])
@Check(
  'CHK_restaurant_reviews_scores_range',
  `"overall" BETWEEN 1 AND 5 AND "portion" BETWEEN 1 AND 5 AND "taste" BETWEEN 1 AND 5 AND "freshness" BETWEEN 1 AND 5 AND "value" BETWEEN 1 AND 5`,
)
@Check(
  'CHK_restaurant_reviews_wait_minutes_range',
  `"wait_minutes" BETWEEN 0 AND 180`,
)
export class RestaurantReview {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_restaurant_reviews_id',
  })
  id: string;

  /** Generated once by the client for this review; retries reuse it. */
  @Column({ name: 'client_review_id', type: 'uuid' })
  clientReviewId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_restaurant_reviews_user_id',
  })
  user: User;

  @Column({ name: 'restaurant_id', type: 'uuid' })
  restaurantId: string;

  @ManyToOne(() => Restaurant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'restaurant_id',
    foreignKeyConstraintName: 'FK_restaurant_reviews_restaurant_id',
  })
  restaurant: Restaurant;

  @Column({ type: 'smallint' })
  overall: number;

  @Column({ type: 'smallint' })
  portion: number;

  @Column({ type: 'smallint' })
  taste: number;

  @Column({ type: 'smallint' })
  freshness: number;

  @Column({ type: 'smallint' })
  value: number;

  @Column({ name: 'wait_minutes', type: 'integer' })
  waitMinutes: number;

  /** When the student made the observation on the device (UTC). */
  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  /** Bogotá calendar date of `occurredAt` (YYYY-MM-DD). */
  @Column({ name: 'review_date', type: 'date' })
  reviewDate: string;

  /** Deterministic demo rows (seed:bq13). Never client-controlled. */
  @Column({ type: 'boolean', default: false })
  synthetic: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
