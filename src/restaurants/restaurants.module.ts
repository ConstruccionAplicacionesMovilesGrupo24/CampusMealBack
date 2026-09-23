import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meal } from './entities/meal.entity';
import { Restaurant } from './entities/restaurant.entity';

// No controller yet: issue #4 is catalog data + the route adapter only.
// BQ4 (#5) and BQ5 (#6) inject Restaurant/Meal repositories via this module.
@Module({
  imports: [TypeOrmModule.forFeature([Restaurant, Meal])],
  exports: [TypeOrmModule],
})
export class RestaurantsModule {}
