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
import { User } from '../../users/entities/user.entity';

/**
 * One pantry item of one user. Deleting is soft (`active = false`), so history stays.
 * The composite index serves the BQ2 query (owner + active + expiration window).
 */
@Entity({ name: 'inventory_items' })
@Index('IDX_inventory_items_user_active_expiration', [
  'userId',
  'active',
  'expirationDate',
])
@Check('CHK_inventory_items_name_not_blank', `length(btrim("name")) > 0`)
@Check('CHK_inventory_items_unit_not_blank', `length(btrim("unit")) > 0`)
@Check(
  'CHK_inventory_items_quantity_non_negative',
  `"quantity" >= 0 AND "quantity" < 'Infinity'::double precision`,
)
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_inventory_items_id',
  })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_inventory_items_user_id',
  })
  user: User;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'double precision' })
  quantity: number;

  @Column({ type: 'varchar', length: 30 })
  unit: string;

  /** Calendar date `YYYY-MM-DD`; the postgres driver keeps it as a string, never an instant. */
  @Column({ name: 'expiration_date', type: 'date' })
  expirationDate: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
