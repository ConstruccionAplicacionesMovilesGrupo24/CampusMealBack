import { Injectable } from '@nestjs/common';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import {
  InventoryItemResponseDto,
  InventoryItemsResponseDto,
} from './dto/inventory-response.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryItem } from './entities/inventory-item.entity';
import {
  addCalendarDays,
  CalendarDate,
  currentCalendarDate,
  formatCalendarDate,
  remainingDays,
} from './inventory-date';
import {
  emptyInventoryUpdate,
  inventoryItemNotFound,
} from './inventory-errors';
import { InventoryRepository } from './inventory.repository';

/**
 * Inventory rules for BQ2. `remainingDays` is always calculated here from today's date in
 * America/Bogota, never taken from the client, and today is resolved once per operation so
 * every item in one response is measured against the same day.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly inventoryItems: InventoryRepository) {}

  /** Active items of the user, expired ones included. */
  async list(userId: string): Promise<InventoryItemsResponseDto> {
    const items = await this.inventoryItems.findActiveByUser(userId);
    return this.toResponse(items, currentCalendarDate());
  }

  /**
   * BQ2: active items expiring between today and today + withinDays, both inclusive.
   * Expired items (remainingDays < 0) and inactive items are excluded.
   */
  async getExpiring(
    userId: string,
    withinDays: number,
  ): Promise<InventoryItemsResponseDto> {
    const today = currentCalendarDate();
    const items = await this.inventoryItems.findExpiringByUser(
      userId,
      formatCalendarDate(today),
      formatCalendarDate(addCalendarDays(today, withinDays)),
    );
    return this.toResponse(items, today);
  }

  async create(
    userId: string,
    dto: CreateInventoryItemDto,
  ): Promise<InventoryItemResponseDto> {
    const item = await this.inventoryItems.createForUser(userId, {
      name: dto.name,
      quantity: dto.quantity,
      unit: dto.unit,
      expirationDate: dto.expirationDate,
    });
    return this.toItemResponse(item, currentCalendarDate());
  }

  /** Updates an active item of the user. Omitted fields keep their stored value. */
  async update(
    userId: string,
    itemId: string,
    dto: UpdateInventoryItemDto,
  ): Promise<InventoryItemResponseDto> {
    if (
      dto.name === undefined &&
      dto.quantity === undefined &&
      dto.unit === undefined &&
      dto.expirationDate === undefined
    ) {
      throw emptyInventoryUpdate();
    }

    const item = await this.inventoryItems.findOwnedActiveById(userId, itemId);
    if (!item) {
      throw inventoryItemNotFound();
    }

    if (dto.name !== undefined) {
      item.name = dto.name;
    }
    if (dto.quantity !== undefined) {
      item.quantity = dto.quantity;
    }
    if (dto.unit !== undefined) {
      item.unit = dto.unit;
    }
    if (dto.expirationDate !== undefined) {
      item.expirationDate = dto.expirationDate;
    }

    const saved = await this.inventoryItems.save(item);
    return this.toItemResponse(saved, currentCalendarDate());
  }

  /** Soft deactivation; the row stays in PostgreSQL with `active = false`. */
  async deactivate(userId: string, itemId: string): Promise<void> {
    const deactivated = await this.inventoryItems.deactivateOwnedActive(
      userId,
      itemId,
    );
    if (!deactivated) {
      throw inventoryItemNotFound();
    }
  }

  private toResponse(
    items: InventoryItem[],
    today: CalendarDate,
  ): InventoryItemsResponseDto {
    return { items: items.map((item) => this.toItemResponse(item, today)) };
  }

  private toItemResponse(
    item: InventoryItem,
    today: CalendarDate,
  ): InventoryItemResponseDto {
    return {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      expirationDate: item.expirationDate,
      remainingDays: remainingDays(today, item.expirationDate),
      active: item.active,
    };
  }
}
