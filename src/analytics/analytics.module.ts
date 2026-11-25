import { SupplyGapService } from './supply-gap.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecommendationRun } from '../recommendations/entities/recommendation-run.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { UsageEvent } from './entities/usage-event.entity';
import { PartnerHealthService } from './partner-health.service';
import { PerformanceEvent } from './entities/performance-event.entity';
import { PerformanceService } from './performance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnalyticsEvent,
      UsageEvent,
      RecommendationRun,
      PerformanceEvent,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [
    SupplyGapService,
    AnalyticsService,
    PartnerHealthService,
    PerformanceService,
  ],
})
export class AnalyticsModule {}
