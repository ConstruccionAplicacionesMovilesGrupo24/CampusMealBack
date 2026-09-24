import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from '../inventory/inventory.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { RoutesModule } from '../routes/routes.module';
import { RecommendationAlternative } from './entities/recommendation-alternative.entity';
import { RecommendationRun } from './entities/recommendation-run.entity';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsRepository } from './recommendations.repository';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecommendationRun, RecommendationAlternative]),
    InventoryModule,
    // Re-exports TypeOrmModule.forFeature([Restaurant, Meal]) so this module can
    // @InjectRepository them directly, without going through RestaurantsService's HTTP DTOs.
    RestaurantsModule,
    RoutesModule,
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, RecommendationsRepository],
})
export class RecommendationsModule {}
