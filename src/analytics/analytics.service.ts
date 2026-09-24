import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Configuration } from '../config/configuration';
import { RecommendationRun } from '../recommendations/entities/recommendation-run.entity';
import { ExplanationType } from '../recommendations/enums/explanation-type.enum';
import { invalidDateRange, recommendationNotFound } from './analytics-errors';
import { CreateAnalyticsEventDto } from './dto/create-analytics-event.dto';
import { ExplanationSelectionQueryDto } from './dto/explanation-selection-query.dto';
import {
  ExplanationSelectionResponseDto,
  ExplanationSelectionResultDto,
} from './dto/explanation-selection-response.dto';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsEventType } from './enums/analytics-event-type.enum';

interface ExplanationSelectionRow {
  explanation_type: ExplanationType;
  impressions: string;
  selections: string;
}

/**
 * Issue #7 / BQ8: "Which recommendation explanations obtain the highest user selection rate?"
 *
 * selectionRate = distinct recommendations selected ÷ distinct recommendations displayed,
 * grouped by the explanation type stored on the recommendation run (never sent by clients).
 */
@Injectable()
export class AnalyticsService {
  private readonly timezone: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<Configuration, true>,
  ) {
    this.timezone = config.get('app', { infer: true }).timezone;
  }

  /**
   * Idempotent ingestion: a repeated clientEventId is ignored (ON CONFLICT DO NOTHING), so
   * client retries never create duplicate rows. The recommendation must belong to the user.
   */
  async recordEvent(
    userId: string,
    dto: CreateAnalyticsEventDto,
  ): Promise<void> {
    const owned = await this.dataSource
      .getRepository(RecommendationRun)
      .exists({ where: { id: dto.recommendationId, userId } });
    if (!owned) throw recommendationNotFound();

    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(AnalyticsEvent)
      .values({
        clientEventId: dto.clientEventId,
        userId,
        recommendationId: dto.recommendationId,
        eventType: dto.eventType,
        selectedAlternative:
          dto.eventType === AnalyticsEventType.RECOMMENDATION_SELECTED
            ? (dto.selectedAlternative ?? null)
            : null,
        platform: dto.platform,
        occurredAt: new Date(dto.occurredAt),
      })
      .orIgnore()
      .execute();
  }

  /**
   * BQ8 aggregated in PostgreSQL (no background worker). A recommendation counts as displayed
   * when it has an impression — or a selection, since a selected recommendation was
   * necessarily on screen even if its impression event was lost — with occurredAt inside
   * [from, to] in APP_TIMEZONE. Runs without an explanation type (no alternatives) are skipped.
   */
  async explanationSelection(
    query: ExplanationSelectionQueryDto,
  ): Promise<ExplanationSelectionResponseDto> {
    if (query.from > query.to) throw invalidDateRange();

    const rows: ExplanationSelectionRow[] = await this.dataSource.query(
      `
      WITH per_recommendation AS (
        SELECT
          e.recommendation_id,
          bool_or(e.event_type = 'RECOMMENDATION_SELECTED') AS selected
        FROM analytics_events e
        WHERE (e.occurred_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
        GROUP BY e.recommendation_id
      )
      SELECT
        r.explanation_type,
        COUNT(*) AS impressions,
        COUNT(*) FILTER (WHERE p.selected) AS selections
      FROM per_recommendation p
      JOIN recommendation_runs r ON r.id = p.recommendation_id
      WHERE r.explanation_type IS NOT NULL
      GROUP BY r.explanation_type
      `,
      [query.from, query.to, this.timezone],
    );

    const results: ExplanationSelectionResultDto[] = rows.map((row) => {
      const impressions = Number(row.impressions);
      const selections = Number(row.selections);
      return {
        explanationType: row.explanation_type,
        impressions,
        selections,
        selectionRate:
          impressions === 0
            ? 0
            : Math.round((selections / impressions) * 10000) / 10000,
      };
    });

    // Highest selection rate first; ties: more impressions, then explanation type name.
    results.sort(
      (a, b) =>
        b.selectionRate - a.selectionRate ||
        b.impressions - a.impressions ||
        a.explanationType.localeCompare(b.explanationType),
    );

    return { from: query.from, to: query.to, results };
  }
}
