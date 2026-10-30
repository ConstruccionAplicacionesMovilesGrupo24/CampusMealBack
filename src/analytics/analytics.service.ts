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
import { ZoneDemandQueryDto } from './dto/zone-demand-query.dto';
import { ZoneDemandResponseDto } from './dto/zone-demand-response.dto';
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

interface UsageDemandRow {
  user_id: string;
  feature: UsageFeature;
  zone_id: string | null;
  food_category: string | null;
  budget_band: string | null;
  hour: number;
  synthetic: boolean;
}

interface SelectionDemandRow {
  user_id: string;
  zone: string | null;
  meal_category: string | null;
  estimated_cost: number | string;
  hour: number;
  synthetic: boolean;
}

interface MutableZone {
  usage: UsageDemandRow[];
  selection: SelectionDemandRow[];
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

  async zoneDemand(query: ZoneDemandQueryDto): Promise<ZoneDemandResponseDto> {
    if (query.from > query.to) {
      throw invalidDateRange();
    }

    const fromDate = new Date(`${query.from}T00:00:00Z`);
    const toDate = new Date(`${query.to}T00:00:00Z`);

    const days =
      Math.floor(
        (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1;

    if (!Number.isFinite(days) || days < 1 || days > 92) {
      throw invalidDateRange();
    }

    // 1. Consultar eventos de uso
    const usageRows: UsageDemandRow[] = await this.dataSource.query(
      `
      SELECT
        ue.user_id::text AS user_id,
        ue.feature,
        ue.zone_id,
        ue.food_category,
        ue.budget_band,
        EXTRACT(
          HOUR FROM ue.occurred_at AT TIME ZONE $3
        )::integer AS hour,
        COALESCE(ue.synthetic, false) AS synthetic
      FROM usage_events ue
      WHERE ue.event_type = 'FEATURE_USED'
        AND ue.feature IN (
          'RESTAURANT_SEARCH',
          'RESTAURANT_DETAIL'
        )
        AND ue.user_id IS NOT NULL
        AND ue.occurred_at >= (
          $1::date::timestamp AT TIME ZONE $3
        )
        AND ue.occurred_at < (
          ($2::date + 1)::timestamp AT TIME ZONE $3
        )
      `,
      [query.from, query.to, this.timezone],
    );

    // 2. Consultar recomendaciones seleccionadas
    const selectionRows: SelectionDemandRow[] = await this.dataSource.query(
      `
    SELECT
      ae.user_id::text AS user_id,
      rr.zone,
      ra.metadata ->> 'mealCategory' AS meal_category,
      ra.estimated_cost,
      EXTRACT(
        HOUR FROM ae.occurred_at AT TIME ZONE $3
      )::integer AS hour,
      COALESCE(rr.synthetic, false) AS synthetic
    FROM analytics_events ae
    JOIN recommendation_runs rr
      ON rr.id = ae.recommendation_id
    JOIN recommendation_alternatives ra
      ON ra.recommendation_id = ae.recommendation_id
    AND ra.type = ae.selected_alternative
    WHERE ae.event_type = 'RECOMMENDATION_SELECTED'
      AND ae.selected_alternative IN ('WALK', 'ORDER')
      AND (ae.occurred_at AT TIME ZONE $3)::date
          BETWEEN $1::date AND $2::date
      `,
      [query.from, query.to, this.timezone],
    );

    // 3. Organizar los eventos por zona
    const zones = new Map<string, MutableZone>();

    const getOrCreateZone = (zoneName: string): MutableZone => {
      const existing = zones.get(zoneName);

      if (existing) {
        return existing;
      }

      const created: MutableZone = {
        usage: [],
        selection: [],
      };

      zones.set(zoneName, created);
      return created;
    };

    for (const row of usageRows) {
      const zoneName = row.zone_id ?? 'unknown';
      getOrCreateZone(zoneName).usage.push(row);
    }

    for (const row of selectionRows) {
      const zoneName = row.zone ?? 'unknown';
      getOrCreateZone(zoneName).selection.push(row);
    }

    // 4. Detectar datos sintéticos
    const containsSyntheticData =
      usageRows.some((row) => row.synthetic) ||
      selectionRows.some((row) => row.synthetic);

    const MIN_USERS = 5;
    let suppressedCells = 0;

    // 5. Estructura interna para agrupar eventos
    type Bucket = {
      count: number;
      users: Set<string>;
    };

    type InteractionBucket = {
      detailOpenings: number;
      selections: number;
      users: Set<string>;
    };

    type HourBucket = {
      searches: number;
      detailOpenings: number;
      selections: number;
      users: Set<string>;
    };

    const createBucket = (): Bucket => ({
      count: 0,
      users: new Set<string>(),
    });

    const getBucket = (map: Map<string, Bucket>, key: string): Bucket => {
      let bucket = map.get(key);

      if (!bucket) {
        bucket = createBucket();
        map.set(key, bucket);
      }

      return bucket;
    };

    const getInteractionBucket = (
      map: Map<string, InteractionBucket>,
      key: string,
    ): InteractionBucket => {
      let bucket = map.get(key);

      if (!bucket) {
        bucket = {
          detailOpenings: 0,
          selections: 0,
          users: new Set<string>(),
        };

        map.set(key, bucket);
      }

      return bucket;
    };

    const getHourBucket = (
      map: Map<string, HourBucket>,
      key: string,
    ): HourBucket => {
      let bucket = map.get(key);

      if (!bucket) {
        bucket = {
          searches: 0,
          detailOpenings: 0,
          selections: 0,
          users: new Set<string>(),
        };

        map.set(key, bucket);
      }

      return bucket;
    };

    const addEvent = (bucket: Bucket, userId: string): void => {
      bucket.count++;
      bucket.users.add(userId);
    };

    const protectBucket = (bucket: Bucket) => {
      const suppressed = bucket.users.size < MIN_USERS;

      if (suppressed) {
        suppressedCells++;
      }

      return {
        count: suppressed ? null : bucket.count,
        distinctUsers: suppressed ? null : bucket.users.size,
        suppressed,
      };
    };
    // Normalizar categorías vacías
    const normalize = (value: string | null | undefined): string => {
      return value?.trim() || 'unknown';
    };

    // Rango de precio de la alternativa
    const getPriceBand = (
      value: number | string | null | undefined,
    ): string => {
      if (value === null || value === undefined) {
        return 'unknown';
      }

      const price = Number(value);

      if (!Number.isFinite(price) || price < 0) {
        return 'unknown';
      }

      if (price <= 15000) {
        return 'LOW';
      }

      if (price <= 25000) {
        return 'MEDIUM';
      }

      return 'HIGH';
    };

    // 6. Calcular estadísticas para cada zona
    const finalizedZones = Array.from(zones.entries()).map(
      ([zoneName, zoneData]) => {
        const searchBucket = createBucket();
        const detailBucket = createBucket();
        const selectionBucket = createBucket();

        const allUsers = new Set<string>();

        const categoryBuckets = new Map<string, Bucket>();
        const budgetBuckets = new Map<string, Bucket>();

        const priceBuckets = new Map<string, InteractionBucket>();

        const hourBuckets = new Map<string, HourBucket>();

        // Eventos de uso
        for (const row of zoneData.usage) {
          const userId = String(row.user_id);

          allUsers.add(userId);

          if (row.feature === UsageFeature.RESTAURANT_SEARCH) {
            addEvent(searchBucket, userId);

            const budget = normalize(row.budget_band);

            addEvent(getBucket(budgetBuckets, budget), userId);
          }

          if (row.feature === UsageFeature.RESTAURANT_DETAIL) {
            addEvent(detailBucket, userId);

            const range = normalize(row.budget_band);

            const priceBucket = getInteractionBucket(priceBuckets, range);

            priceBucket.detailOpenings++;
            priceBucket.users.add(userId);
          }

          const hour = Number(row.hour);

          if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
            const hourBucket = getHourBucket(hourBuckets, String(hour));

            if (row.feature === UsageFeature.RESTAURANT_SEARCH) {
              hourBucket.searches++;
            }

            if (row.feature === UsageFeature.RESTAURANT_DETAIL) {
              hourBucket.detailOpenings++;
            }

            hourBucket.users.add(userId);
          }
        }

        // Selecciones WALK / ORDER
        for (const row of zoneData.selection) {
          const userId = String(row.user_id);

          allUsers.add(userId);
          addEvent(selectionBucket, userId);

          const category = normalize(row.meal_category);

          addEvent(getBucket(categoryBuckets, category), userId);

          const priceRange = getPriceBand(row.estimated_cost);

          const priceBucket = getInteractionBucket(priceBuckets, priceRange);

          priceBucket.selections++;
          priceBucket.users.add(userId);

          const hour = Number(row.hour);

          if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
            const hourBucket = getHourBucket(hourBuckets, String(hour));

            hourBucket.selections++;
            hourBucket.users.add(userId);
          }
        }

        const totalsSuppressed = allUsers.size < MIN_USERS;

        if (totalsSuppressed) {
          suppressedCells++;
        }

        const totals = {
          searches: totalsSuppressed ? null : searchBucket.count,

          detailOpenings: totalsSuppressed ? null : detailBucket.count,

          selections: totalsSuppressed ? null : selectionBucket.count,

          distinctUsers: totalsSuppressed ? null : allUsers.size,

          suppressed: totalsSuppressed,
        };

        // Si toda la zona se suprime, no exponemos breakdowns
        if (totalsSuppressed) {
          return {
            zone: zoneName,
            totals,
            categories: [],
            searchedBudgetRanges: [],
            interactionPriceRanges: [],
            hours: [],
          };
        }

        const categories = Array.from(categoryBuckets.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, bucket]) => {
            const protectedBucket = protectBucket(bucket);

            return {
              category,
              selections: protectedBucket.count,
              distinctUsers: protectedBucket.distinctUsers,
              suppressed: protectedBucket.suppressed,
            };
          });

        const searchedBudgetRanges = Array.from(budgetBuckets.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([range, bucket]) => {
            const protectedBucket = protectBucket(bucket);

            return {
              range,
              searches: protectedBucket.count,
              distinctUsers: protectedBucket.distinctUsers,
              suppressed: protectedBucket.suppressed,
            };
          });

        const interactionPriceRanges = Array.from(priceBuckets.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([range, bucket]) => {
            const suppressed = bucket.users.size < MIN_USERS;

            if (suppressed) {
              suppressedCells++;
            }

            return {
              range,
              detailOpenings: suppressed ? null : bucket.detailOpenings,
              selections: suppressed ? null : bucket.selections,
              distinctUsers: suppressed ? null : bucket.users.size,
              suppressed,
            };
          });

        const hours = Array.from(hourBuckets.entries())
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([hour, bucket]) => {
            const suppressed = bucket.users.size < MIN_USERS;

            if (suppressed) {
              suppressedCells++;
            }

            return {
              hour: Number(hour),
              searches: suppressed ? null : bucket.searches,
              detailOpenings: suppressed ? null : bucket.detailOpenings,
              selections: suppressed ? null : bucket.selections,
              distinctUsers: suppressed ? null : bucket.users.size,
              suppressed,
            };
          });

        return {
          zone: zoneName,
          totals,
          categories,
          searchedBudgetRanges,
          interactionPriceRanges,
          hours,
        };
      },
    );

    // 14. Construir la respuesta
    return {
      contractVersion: 1,
      from: query.from,
      to: query.to,
      timezone: this.timezone,
      generatedAt: new Date().toISOString(),
      minDistinctUsersPerCell: MIN_USERS,
      containsSyntheticData,
      interpretation: 'INTEREST_INDICATORS_NOT_VERIFIED_PURCHASES',
      suppressedCells,
      zones: finalizedZones,
    };
  }
}
