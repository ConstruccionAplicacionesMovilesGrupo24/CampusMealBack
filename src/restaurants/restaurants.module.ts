import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoutesModule } from '../routes/routes.module';
import { Meal } from './entities/meal.entity';
import { Restaurant } from './entities/restaurant.entity';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';

@Module({
  imports: [TypeOrmModule.forFeature([Restaurant, Meal]), RoutesModule],
  controllers: [RestaurantsController],
  providers: [RestaurantsService],
  exports: [TypeOrmModule, RestaurantsService],
})
export class RestaurantsModule {}
