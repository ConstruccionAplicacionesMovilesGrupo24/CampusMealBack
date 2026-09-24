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
import { MealAlternative } from '../enums/meal-alternative.enum';
import { RecommendationRun } from './recommendation-run.entity';

@Entity({ name: 'recommendation_alternatives' })
@Index('IDX_recommendation_alternatives_recommendation_id', [
  'recommendationId',
])
@Check('CHK_recommendation_alternatives_rank_positive', `"rank" > 0`)
@Check(
  'CHK_recommendation_alternatives_score_range',
  `"score" >= 0 AND "score" <= 100`,
)
export class RecommendationAlternative {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_recommendation_alternatives_id',
  })
  id: string;

  @Column({ name: 'recommendation_id', type: 'uuid' })
  recommendationId: string;

  @ManyToOne(() => RecommendationRun, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'recommendation_id',
    foreignKeyConstraintName: 'FK_recommendation_alternatives_recommendation_id',
  })
  recommendationRun: RecommendationRun;

  @Column({
    type: 'enum',
    enum: MealAlternative,
    enumName: 'meal_alternative',
  })
  type: MealAlternative;

  @Column({ type: 'integer' })
  rank: number;

  @Column({ type: 'double precision' })
  score: number;

  @Column({ type: 'boolean' })
  recommended: boolean;

  @Column({ name: 'estimated_minutes', type: 'integer' })
  estimatedMinutes: number;

  /** Whole Colombian pesos. */
  @Column({ name: 'estimated_cost', type: 'integer' })
  estimatedCost: number;

  /** Expiring-ingredients list for COOK, restaurant summary for WALK/ORDER — shape varies by `type`. */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
