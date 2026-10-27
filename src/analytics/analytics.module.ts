import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecommendationRun } from '../recommendations/entities/recommendation-run.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { UsageEvent } from './entities/usage-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnalyticsEvent, UsageEvent, RecommendationRun]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
