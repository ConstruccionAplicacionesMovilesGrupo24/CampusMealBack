import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RestaurantReview } from './entities/restaurant-review.entity';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/** Sprint 4 / S4-03: structured restaurant reviews (BQ13 input). */
@Module({
  imports: [TypeOrmModule.forFeature([RestaurantReview])],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
