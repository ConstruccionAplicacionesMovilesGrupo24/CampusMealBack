import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { ErrorCode } from '../common/enums/error-code.enum';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import {
  DEFAULT_WITHIN_DAYS,
  ExpiringInventoryQueryDto,
  MAX_WITHIN_DAYS,
} from './dto/expiring-inventory-query.dto';
import {
  InventoryItemResponseDto,
  InventoryItemsResponseDto,
} from './dto/inventory-response.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryService } from './inventory.service';

const itemNotFound = (path: string) =>
  ApiErrorResponse(HttpStatus.NOT_FOUND, path, {
    code: ErrorCode.INVENTORY_ITEM_NOT_FOUND,
    message: 'Inventory item not found',
  });

@ApiTags('Inventory')
@Controller('inventory')
@Auth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({
    summary: "List the authenticated user's active inventory",
    description:
      'Active items only, including already expired ones (negative `remainingDays`). Ordered by expiration date, then name, then id. Returns `{"items":[]}` when the inventory is empty.',
  })
  @ApiOkResponse({ type: InventoryItemsResponseDto })
  list(@CurrentUser('id') userId: string): Promise<InventoryItemsResponseDto> {
    return this.inventoryService.list(userId);
  }

  // Declared before the :id routes so the static path is never treated as an id.
  @Get('expiring')
  @ApiOperation({
    summary: 'BQ2: items expiring soon, in consumption priority order',
    description:
      `Active items whose expiration date is between today and today + withinDays in America/Bogota, both ends included. ` +
      `Expired items (remainingDays < 0) and inactive items are excluded; an item expiring today (remainingDays = 0) is included. ` +
      `withinDays defaults to ${DEFAULT_WITHIN_DAYS} and accepts integers from 0 to ${MAX_WITHIN_DAYS}. ` +
      'Items come in priority order (soonest expiration first, then name, then id); clients display them as received.',
  })
  @ApiOkResponse({ type: InventoryItemsResponseDto })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, '/api/v1/inventory/expiring', {
    code: ErrorCode.VALIDATION_ERROR,
    message: 'withinDays must not be greater than 30',
  })
  getExpiring(
    @CurrentUser('id') userId: string,
    @Query() query: ExpiringInventoryQueryDto,
  ): Promise<InventoryItemsResponseDto> {
    return this.inventoryService.getExpiring(userId, query.withinDays);
  }

  @Post()
  @ApiOperation({
    summary: 'Add an item to the inventory',
    description:
      'The item belongs to the authenticated user and starts active. A past expiration date is allowed, so an already expired item can be recorded.',
  })
  @ApiCreatedResponse({ type: InventoryItemResponseDto })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, '/api/v1/inventory', {
    code: ErrorCode.VALIDATION_ERROR,
    message: 'expirationDate must be a real calendar date in YYYY-MM-DD format',
  })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateInventoryItemDto,
  ): Promise<InventoryItemResponseDto> {
    return this.inventoryService.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an active item',
    description:
      'Accepts any subset of name, quantity, unit and expirationDate; omitted fields keep their value. An empty body is rejected. Items of other users and inactive items answer 404.',
  })
  @ApiOkResponse({ type: InventoryItemResponseDto })
  @ApiErrorResponse(HttpStatus.BAD_REQUEST, '/api/v1/inventory/{id}', {
    code: ErrorCode.VALIDATION_ERROR,
    message:
      'Provide at least one of name, quantity, unit or expirationDate to update',
  })
  @itemNotFound('/api/v1/inventory/{id}')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateInventoryItemDto,
  ): Promise<InventoryItemResponseDto> {
    return this.inventoryService.update(userId, itemId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deactivate an item (soft delete)',
    description:
      'Sets `active = false` and keeps the row in PostgreSQL; the item then disappears from both list endpoints. Deactivating twice answers 404.',
  })
  @ApiNoContentResponse({ description: 'Item deactivated. Empty body.' })
  @itemNotFound('/api/v1/inventory/{id}')
  deactivate(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) itemId: string,
  ): Promise<void> {
    return this.inventoryService.deactivate(userId, itemId);
  }
}
