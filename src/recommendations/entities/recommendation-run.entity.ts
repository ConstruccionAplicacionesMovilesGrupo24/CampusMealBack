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
import { User } from '../../users/entities/user.entity';
import { ExplanationType } from '../enums/explanation-type.enum';

/**
 * One `POST meal-decisions/compare` call. Exact user coordinates are never stored here
 * (architecture doc §7) — only the context fields needed to audit the decision.
 */
@Entity({ name: 'recommendation_runs' })
@Index('IDX_recommendation_runs_user_id', ['userId'])
@Check('CHK_recommendation_runs_minutes_positive', `"available_minutes" > 0`)
@Check('CHK_recommendation_runs_budget_non_negative', `"maximum_budget" >= 0`)
export class RecommendationRun {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_recommendation_runs_id',
  })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_recommendation_runs_user_id',
  })
  user: User;

  @Column({ name: 'available_minutes', type: 'integer' })
  availableMinutes: number;

  /** Whole Colombian pesos. */
  @Column({ name: 'maximum_budget', type: 'integer' })
  maximumBudget: number;

  /** Null when `alternatives` was empty — no candidate had a dominant strategy. */
  @Column({
    name: 'explanation_type',
    type: 'enum',
    enum: ExplanationType,
    enumName: 'explanation_type',
    nullable: true,
  })
  explanationType: ExplanationType | null;

  @Column({ name: 'main_explanation', type: 'text' })
  mainExplanation: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
