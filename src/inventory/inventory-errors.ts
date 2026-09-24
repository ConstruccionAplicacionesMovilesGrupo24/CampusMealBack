import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../common/enums/error-code.enum';

/**
 * Same response for an unknown item, an inactive item and another user's item, so a caller
 * cannot learn whether a UUID belongs to somebody else.
 */
export const inventoryItemNotFound = () =>
  new NotFoundException({
    code: ErrorCode.INVENTORY_ITEM_NOT_FOUND,
    message: 'Inventory item not found',
  });

export const emptyInventoryUpdate = () =>
  new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message:
      'Provide at least one of name, quantity, unit or expirationDate to update',
  });
