import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Configuration } from '../config/configuration';
import { RecommendationRun } from '../recommendations/entities/recommendation-run.entity';
import { ExplanationType } from '../recommendations/enums/explanation-type.enum';
import { currentCalendarDate } from '../inventory/inventory-date';
import {
  featureNotAllowedForSession,
  invalidDateRange,
  occurredAtOutOfRange,
  recommendationNotFound,
} from './analytics-errors';
import { CreateAnalyticsEventDto } from './dto/create-analytics-event.dto';
import { CreateUsageEventDto } from './dto/create-usage-event.dto';
import { ExplanationSelectionQueryDto } from './dto/explanation-selection-query.dto';
import {
  ExplanationSelectionResponseDto,
  ExplanationSelectionResultDto,
} from './dto/explanation-selection-response.dto';
import { FeatureAdoptionQueryDto } from './dto/feature-adoption-query.dto';
import {
  FeatureAdoptionResponseDto,
  FeatureAdoptionResultDto,
} from './dto/feature-adoption-response.dto';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { UsageEvent } from './entities/usage-event.entity';
import { AnalyticsEventType } from './enums/analytics-event-type.enum';
import { UsageEventType } from './enums/usage-event-type.enum';
import { UsageFeature } from './enums/usage-feature.enum';

interface ExplanationSelectionRow {
  explanation_type: ExplanationType;
  impressions: string;
  selections: string;
}

interface FeatureAdoptionRow {
  feature: UsageFeature;
  low_use_users: string;
  mau: string;
}

/** BQ6 thresholds: low use = fewer than 2 uses; flagged at 80% of monthly active users. */
const LOW_USE_BELOW_USES = 2;
const ADOPTION_THRESHOLD = 0.8;
/** Accepted clock skew into the future, and how far back a late sync may still be attributed. */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_EVENT_AGE_DAYS = 90;

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

  /**
   * Sprint 3 / BQ6 ingestion. Idempotent per account: ON CONFLICT (user_id, client_event_id)
   * DO NOTHING, so retries and outbox replays never create duplicates. The owner always comes
   * from the access token and `synthetic` is never client-controlled.
   */
  async recordUsageEvent(
    userId: string,
    dto: CreateUsageEventDto,
  ): Promise<void> {
    if (
      dto.eventType === UsageEventType.SESSION_STARTED &&
      dto.feature != null
    ) {
      throw featureNotAllowedForSession();
    }

    const occurredAt = new Date(dto.occurredAt);
    const now = Date.now();
    const oldest = now - MAX_EVENT_AGE_DAYS * 24 * 60 * 60 * 1000;
    if (
      occurredAt.getTime() > now + MAX_FUTURE_SKEW_MS ||
      occurredAt.getTime() < oldest
    ) {
      throw occurredAtOutOfRange(MAX_EVENT_AGE_DAYS);
    }

    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(UsageEvent)
      .values({
        clientEventId: dto.clientEventId,
        userId,
        eventType: dto.eventType,
        feature:
          dto.eventType === UsageEventType.FEATURE_USED
            ? (dto.feature ?? null)
            : null,
        platform: dto.platform,
        zoneId: dto.zoneId ?? null,
        foodCategory: dto.foodCategory ?? null,
        budgetBand: dto.budgetBand ?? null,
        occurredAt,
      })
      .orIgnore()
      .execute();
  }

  /**
   * BQ6 aggregated in PostgreSQL. MAU = distinct accounts with any usage event whose
   * occurred_at falls in the Bogotá calendar month. Each MAU is crossed with every feature
   * and LEFT JOINed to its use count, so accounts with zero uses count as low-use. Rates are
   * integers over integers; `flagged` compares lowUse * 5 >= mau * 4 (= 80%) to avoid
   * floating-point error on exact 8/10 cases.
   */
  async featureAdoption(
    query: FeatureAdoptionQueryDto,
  ): Promise<FeatureAdoptionResponseDto> {
    const features = Object.values(UsageFeature);
    const today = currentCalendarDate(new Date(), this.timezone);
    const currentMonth = `${today.year}-${String(today.month).padStart(2, '0')}`;

    const rows: FeatureAdoptionRow[] = await this.dataSource.query(
      `
      WITH month_events AS (
        SELECT user_id, event_type, feature::text AS feature
        FROM usage_events
        WHERE to_char(occurred_at AT TIME ZONE $1, 'YYYY-MM') = $2
      ),
      mau AS (SELECT DISTINCT user_id FROM month_events),
      uses AS (
        SELECT user_id, feature, COUNT(*) AS uses
        FROM month_events
        WHERE event_type = 'FEATURE_USED'
        GROUP BY user_id, feature
      )
      SELECT
        f.feature,
        COUNT(*) FILTER (WHERE COALESCE(u.uses, 0) < $3) AS low_use_users,
        (SELECT COUNT(*) FROM mau) AS mau
      FROM unnest($4::text[]) AS f(feature)
      CROSS JOIN mau m
      LEFT JOIN uses u ON u.user_id = m.user_id AND u.feature = f.feature
      GROUP BY f.feature
      `,
      [this.timezone, query.month, LOW_USE_BELOW_USES, features],
    );

    const [{ count, synthetic }]: { count: string; synthetic: boolean }[] =
      await this.dataSource.query(
        `
      SELECT COUNT(*) AS count, COALESCE(bool_or(synthetic), false) AS synthetic
      FROM usage_events
      WHERE to_char(occurred_at AT TIME ZONE $1, 'YYYY-MM') = $2
      `,
        [this.timezone, query.month],
      );

    const monthlyActiveUsers = rows.length ? Number(rows[0].mau) : 0;
    const results: FeatureAdoptionResultDto[] = rows
      .map((row) => {
        const lowUseUsers = Number(row.low_use_users);
        return {
          feature: row.feature,
          lowUseUsers,
          lowUseRate:
            Math.round((lowUseUsers / monthlyActiveUsers) * 10000) / 10000,
          flagged: lowUseUsers * 5 >= monthlyActiveUsers * 4,
        };
      })
      .sort(
        (a, b) =>
          b.lowUseRate - a.lowUseRate || a.feature.localeCompare(b.feature),
      );

    return {
      month: query.month,
      status: monthlyActiveUsers === 0 ? 'NO_DATA' : 'OK',
      monthlyActiveUsers,
      threshold: ADOPTION_THRESHOLD,
      lowUseBelowUses: LOW_USE_BELOW_USES,
      partialMonth: query.month === currentMonth,
      eventsReceived: Number(count),
      includesSyntheticData: Boolean(synthetic),
      generatedAt: new Date().toISOString(),
      results,
    };
  }
}
