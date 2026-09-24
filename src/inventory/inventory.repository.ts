import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { InventoryItem } from './entities/inventory-item.entity';

export interface NewInventoryItem {
  name: string;
  quantity: number;
  unit: string;
  expirationDate: string;
}

/**
 * Persistence for inventory items. Every read and write is scoped by `userId`, so a caller
 * can never reach another user's row. Services and controllers use this class instead of the
 * TypeORM repository.
 */
@Injectable()
export class InventoryRepository {
  constructor(
    @InjectRepository(InventoryItem)
    private readonly items: Repository<InventoryItem>,
  ) {}

  createForUser(
    userId: string,
    data: NewInventoryItem,
  ): Promise<InventoryItem> {
    return this.items.save(
      this.items.create({
        userId,
        name: data.name,
        quantity: data.quantity,
        unit: data.unit,
        expirationDate: data.expirationDate,
        active: true,
      }),
    );
  }

  /** Active items of one user, including already expired ones. */
  findActiveByUser(userId: string): Promise<InventoryItem[]> {
    return this.orderedByPriority(
      this.items
        .createQueryBuilder('item')
        .where('item.userId = :userId AND item.active = true', { userId }),
    ).getMany();
  }

  /** Active items whose expiration date falls in [startDate, endDate], both inclusive. */
  findExpiringByUser(
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<InventoryItem[]> {
    return this.orderedByPriority(
      this.items
        .createQueryBuilder('item')
        .where('item.userId = :userId AND item.active = true', { userId })
        .andWhere('item.expirationDate >= :startDate', { startDate })
        .andWhere('item.expirationDate <= :endDate', { endDate }),
    ).getMany();
  }

  findOwnedActiveById(
    userId: string,
    itemId: string,
  ): Promise<InventoryItem | null> {
    return this.items.findOneBy({ id: itemId, userId, active: true });
  }

  save(item: InventoryItem): Promise<InventoryItem> {
    return this.items.save(item);
  }

  /** Soft delete. Returns false when the item is missing, already inactive or another user's. */
  async deactivateOwnedActive(
    userId: string,
    itemId: string,
  ): Promise<boolean> {
    const result = await this.items
      .createQueryBuilder()
      .update(InventoryItem)
      .set({ active: false })
      .where('id = :itemId AND user_id = :userId AND active = true', {
        itemId,
        userId,
      })
      .execute();

    return result.affected === 1;
  }

  /**
   * BQ2 priority order: soonest expiration first, then name, then id as a stable tie-break.
   * `lower(name)` keeps the alphabetical order case-insensitive.
   */
  private orderedByPriority(
    query: SelectQueryBuilder<InventoryItem>,
  ): SelectQueryBuilder<InventoryItem> {
    return query
      .orderBy('item.expiration_date', 'ASC')
      .addOrderBy('lower(item.name)', 'ASC')
      .addOrderBy('item.name', 'ASC')
      .addOrderBy('item.id', 'ASC');
  }
}
