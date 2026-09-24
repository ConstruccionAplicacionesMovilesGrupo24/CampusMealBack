import { PartialType } from '@nestjs/swagger';
import { CreateInventoryItemDto } from './create-inventory-item.dto';

/**
 * Any subset of the create fields. `id`, `userId`, `active` and the timestamps are not
 * updatable, and unknown properties are rejected by the global validation pipe.
 * An empty body is rejected by InventoryService.
 */
export class UpdateInventoryItemDto extends PartialType(
  CreateInventoryItemDto,
) {}
