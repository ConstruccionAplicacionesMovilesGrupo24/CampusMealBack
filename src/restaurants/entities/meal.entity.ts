import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DietaryTag } from '../enums/dietary-tag.enum';
import { Restaurant } from './restaurant.entity';

@Entity({ name: 'meals' })
@Index('IDX_meals_restaurant_id', ['restaurantId'])
@Check('CHK_meals_name_not_blank', `length(btrim("name")) > 0`)
@Check('CHK_meals_price_non_negative', `"price" >= 0`)
export class Meal {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_meals_id' })
  id: string;

  @Column({ name: 'restaurant_id', type: 'uuid' })
  restaurantId: string;

  @ManyToOne(() => Restaurant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'restaurant_id',
    foreignKeyConstraintName: 'FK_meals_restaurant_id',
  })
  restaurant: Restaurant;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  /** Whole Colombian pesos (architecture doc §7 data restrictions). */
  @Column({ type: 'integer' })
  price: number;

  @Column({
    name: 'dietary_tags',
    type: 'enum',
    enum: DietaryTag,
    enumName: 'dietary_tag',
    array: true,
    default: '{}',
  })
  dietaryTags: DietaryTag[];

  @Column({ type: 'boolean', default: true })
  available: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
