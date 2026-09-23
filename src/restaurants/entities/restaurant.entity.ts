import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OpeningPeriod } from '../opening-period';

@Entity({ name: 'restaurants' })
@Check('CHK_restaurants_name_not_blank', `length(btrim("name")) > 0`)
@Check(
  'CHK_restaurants_rating_range',
  `"average_rating" >= 0 AND "average_rating" <= 5`,
)
@Check(
  'CHK_restaurants_delivery_fields',
  `("delivery_available" = false) OR ("estimated_delivery_minutes" IS NOT NULL AND "delivery_fee" IS NOT NULL)`,
)
export class Restaurant {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_restaurants_id',
  })
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'varchar', length: 255 })
  address: string;

  @Column({ type: 'double precision' })
  latitude: number;

  @Column({ type: 'double precision' })
  longitude: number;

  @Column({ name: 'opening_hours', type: 'jsonb' })
  openingHours: OpeningPeriod[];

  @Column({ name: 'average_rating', type: 'double precision' })
  averageRating: number;

  @Column({ name: 'delivery_available', type: 'boolean', default: false })
  deliveryAvailable: boolean;

  @Column({
    name: 'estimated_delivery_minutes',
    type: 'integer',
    nullable: true,
  })
  estimatedDeliveryMinutes: number | null;

  /** Whole Colombian pesos (architecture doc §7 data restrictions). */
  @Column({ name: 'delivery_fee', type: 'integer', nullable: true })
  deliveryFee: number | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
