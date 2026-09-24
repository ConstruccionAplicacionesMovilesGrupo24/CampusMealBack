import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryItem } from './entities/inventory-item.entity';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

/**
 * InventoryService is exported so Issue #6 can read the user's active inventory and BQ2
 * expiration data. InventoryRepository stays internal: other modules go through the service.
 */
@Module({
  imports: [TypeOrmModule.forFeature([InventoryItem])],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository],
  exports: [InventoryService],
})
export class InventoryModule {}
