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
import { MenuChangeType } from '../enums/menu-change-type.enum';
import { MenuRevisionSource } from '../enums/menu-revision-source.enum';
import { Meal } from './meal.entity';
import { Restaurant } from './restaurant.entity';

/**
 * Sprint 4 / S4-03 (BQ13): append-only record of one meaningful menu or price change.
 *
 * Written in the same transaction as the edit itself (`MenuMaintenance`), and only when a value
 * actually changed. Nothing before the first row is known: `created_at`/`updated_at` of meals and
 * restaurants are never treated as menu maintenance. Rows are never updated or deleted by the app.
 */
@Entity({ name: 'menu_revisions' })
@Index('IDX_menu_revisions_restaurant_changed_at', [
  'restaurantId',
  'changedAt',
])
// Declared here too (created by migration 1790800000000) so migration:generate keeps them.
@Check(
  'CHK_menu_revisions_change_type',
  `"change_type" IN ('MENU_ITEM_ADDED', 'MENU_ITEM_REMOVED', 'PRICE_CHANGED', 'AVAILABILITY_CHANGED')`,
)
@Check(
  'CHK_menu_revisions_source',
  `"source" IN ('MAINTENANCE_SCRIPT', 'SYNTHETIC_SEED')`,
)
export class MenuRevision {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_menu_revisions_id',
  })
  id: string;

  @Column({ name: 'restaurant_id', type: 'uuid' })
  restaurantId: string;

  @ManyToOne(() => Restaurant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'restaurant_id',
    foreignKeyConstraintName: 'FK_menu_revisions_restaurant_id',
  })
  restaurant: Restaurant;

  /** Null once the meal was removed; `mealName` keeps what it was. */
  @Column({ name: 'meal_id', type: 'uuid', nullable: true })
  mealId: string | null;

  @ManyToOne(() => Meal, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'meal_id',
    foreignKeyConstraintName: 'FK_menu_revisions_meal_id',
  })
  meal: Meal | null;

  @Column({ name: 'meal_name', type: 'varchar', length: 150 })
  mealName: string;

  @Column({ name: 'change_type', type: 'varchar', length: 40 })
  changeType: MenuChangeType;

  @Column({ name: 'previous_value', type: 'jsonb', nullable: true })
  previousValue: Record<string, unknown> | null;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue: Record<string, unknown> | null;

  /** When the change took effect. Equals the transaction time for maintenance edits. */
  @Column({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;

  @Column({ type: 'varchar', length: 40 })
  source: MenuRevisionSource;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
