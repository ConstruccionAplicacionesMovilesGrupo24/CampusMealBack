import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../common/enums/error-code.enum';
import { round } from '../common/privacy/min-users';
import { Configuration } from '../config/configuration';
import {
  addCalendarDays,
  CalendarDate,
  calendarDaysBetween,
  currentCalendarDate,
  formatCalendarDate,
  parseCalendarDate,
} from '../inventory/inventory-date';
import { occurredAtOutOfRange } from './analytics-errors';
import { CreatePerformanceEventDto } from './dto/create-performance-event.dto';
import { PerformanceQueryDto } from './dto/performance-query.dto';
import {
  CRASH_RATE_THRESHOLD,
  MIN_FRESH_LOADS,
  MIN_SESSIONS,
  P95_THRESHOLD_MS,
  PERFORMANCE_CONTRACT_VERSION,
  PerformanceCombinationDto,
  PerformanceCoverageDto,
  PerformanceResponseDto,
  SampleConfidence,
} from './dto/performance-response.dto';
import { PerformanceEvent } from './entities/performance-event.entity';
import { ClientPlatform } from './enums/client-platform.enum';
import { PerformanceEventType } from './enums/performance-event-type.enum';
import { PerformanceScreen } from './enums/performance-screen.enum';

const MAX_RANGE_DAYS = 92;
/** Same window as usage events: accepted clock skew, and how late a sync may arrive. */
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_EVENT_AGE_DAYS = 90;
const LATE_AFTER_HOURS = 24;

interface CombinationKey {
  platform: ClientPlatform;
  device_model: string;
  os_version: string;
  app_version: string;
}

interface SessionRow extends CombinationKey {
  started: number;
  crashed: number;
  users: number;
  synthetic: boolean;
}

interface LoadRow extends CombinationKey {
  fresh: number;
  p95_ms: number | null;
  cached: number;
  offline: number;
  errors: number;
  timeouts: number;
  cancelled: number;
  synthetic: boolean;
}

interface CoverageRow {
  events: number;
  orphan_crashes: number;
  late_events: number;
  first_occurred_at: Date | null;
  last_occurred_at: Date | null;
  last_received_at: Date | null;
}

const invalid = (message: string) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message });

/**
 * Sprint 4 / S4-09 — BQ1 (Type 1): "Which device model, operating-system version, and application
 * version combinations have a crash rate above 1% or a 95th-percentile loading time above two
 * seconds on the meal-comparison screen?"
 *
 * Everything is computed on demand from performance_events; nothing is precomputed. It counts what
 * clients captured and delivered: see `limitations` and docs/SPRINT4_BQ1.md.
 */
@Injectable()
export class PerformanceService {
  private readonly timezone: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<Configuration, true>,
  ) {
    this.timezone = config.get('app', { infer: true }).timezone;
  }

  /**
   * Idempotent ingestion. ON CONFLICT DO NOTHING covers the three unique indexes, so a replay, a
   * second start/crash of one session or a second outcome of one load never changes a count.
   * `synthetic` is never client-controlled.
   */
  async record(userId: string, dto: CreatePerformanceEventDto): Promise<void> {
    rejectForeignFields(dto);

    const occurredAt = new Date(dto.occurredAt);
    const now = Date.now();
    if (
      occurredAt.getTime() > now + MAX_FUTURE_SKEW_MS ||
      occurredAt.getTime() < now - MAX_EVENT_AGE_DAYS * 86_400_000
    ) {
      throw occurredAtOutOfRange(MAX_EVENT_AGE_DAYS);
    }

    const isLoad = dto.eventType === PerformanceEventType.COMPARISON_LOAD;
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(PerformanceEvent)
      .values({
        clientEventId: dto.clientEventId,
        userId,
        eventType: dto.eventType,
        sessionId: dto.sessionId ?? null,
        loadId: dto.loadId ?? null,
        platform: dto.platform,
        deviceModel: dto.deviceModel,
        osVersion: dto.osVersion,
        appVersion: dto.appVersion,
        screen: isLoad
          ? PerformanceScreen.MEAL_COMPARISON
          : (dto.screen ?? null),
        exceptionClass: dto.exceptionClass ?? null,
        durationMs: dto.durationMs ?? null,
        outcome: dto.outcome ?? null,
        injected: dto.injected ?? false,
        occurredAt,
      })
      .orIgnore()
      .execute();
  }

  async report(
    query: PerformanceQueryDto,
    now: Date = new Date(),
  ): Promise<PerformanceResponseDto> {
    const to = this.validateRange(query, now);
    const includeSynthetic = query.includeSynthetic ?? false;

    const [sessions, loads, coverage] = await Promise.all([
      this.sessions(query, includeSynthetic),
      this.loads(query, includeSynthetic),
      this.coverage(query, to, includeSynthetic),
    ]);
    const combinations = combine(sessions, loads);

    return {
      contractVersion: PERFORMANCE_CONTRACT_VERSION,
      from: query.from,
      to: query.to,
      generatedAt: new Date().toISOString(),
      includeSynthetic,
      includesSyntheticData: combinations.some((c) => c.synthetic),
      thresholds: {
        crashRate: CRASH_RATE_THRESHOLD,
        p95Ms: P95_THRESHOLD_MS,
        comparison: 'STRICTLY_ABOVE',
      },
      samplePolicy: {
        minSessions: MIN_SESSIONS,
        minFreshLoads: MIN_FRESH_LOADS,
      },
      combinations,
      coverage,
      limitations: [
        'Monitored crash rate: only fatal JVM exceptions captured by the app and delivered later. Native crashes, ANRs, force-stops and system kills are not included.',
        'A crash is delivered when the app is opened again: devices that never reopen it are missing from the numerator.',
        'p95 covers successful fresh-network loads only. Errors, timeouts, cached restores, offline history and cancellations are reported separately.',
        `INSUFFICIENT means fewer than ${MIN_SESSIONS} sessions or fewer than ${MIN_FRESH_LOADS} fresh loads: the value describes those records, not the whole population.`,
        'Only platforms that send performance events appear (see coverage.platforms).',
      ],
    };
  }

  private validateRange(query: PerformanceQueryDto, now: Date): CalendarDate {
    const from = parseCalendarDate(query.from);
    const to = parseCalendarDate(query.to);
    if (!from || !to) {
      throw invalid('from and to must be valid calendar dates');
    }
    const days = calendarDaysBetween(from, to) + 1;
    if (days < 1) {
      throw invalid('from must be on or before to');
    }
    if (days > MAX_RANGE_DAYS) {
      throw invalid(`the range must not exceed ${MAX_RANGE_DAYS} days`);
    }
    if (calendarDaysBetween(currentCalendarDate(now, this.timezone), to) > 0) {
      throw invalid('to must not be after today (America/Bogota)');
    }
    return to;
  }

  /**
   * One row per started session (unique index). A crash belongs to the session that started in the
   * window even if it was imported later; injected-crash sessions leave both sides of the rate.
   */
  private sessions(
    query: PerformanceQueryDto,
    includeSynthetic: boolean,
  ): Promise<SessionRow[]> {
    return this.dataSource.query<SessionRow[]>(
      `
      SELECT s.platform, s.device_model, s.os_version, s.app_version,
             COUNT(*)::int AS started,
             COUNT(c.id)::int AS crashed,
             COUNT(DISTINCT s.user_id)::int AS users,
             bool_or(s.synthetic OR COALESCE(c.injected, false)) AS synthetic
      FROM performance_events s
      LEFT JOIN performance_events c
        ON c.user_id = s.user_id
       AND c.session_id = s.session_id
       AND c.event_type = 'FATAL_CRASH'
      WHERE s.event_type = 'SESSION_START'
        AND s.occurred_at >= ($1::date)::timestamp AT TIME ZONE $3
        AND s.occurred_at < ($2::date + 1)::timestamp AT TIME ZONE $3
        AND ($4 OR (NOT s.synthetic AND NOT COALESCE(c.injected, false)))
      GROUP BY s.platform, s.device_model, s.os_version, s.app_version
      `,
      [query.from, query.to, this.timezone, includeSynthetic],
    );
  }

  /**
   * Nearest-rank p95 = value at position ceil(0.95 n), computed with integers ((95 n + 99) / 100) so
   * no floating-point rounding can move the rank.
   */
  private loads(
    query: PerformanceQueryDto,
    includeSynthetic: boolean,
  ): Promise<LoadRow[]> {
    return this.dataSource.query<LoadRow[]>(
      `
      WITH window_loads AS (
        SELECT l.platform, l.device_model, l.os_version, l.app_version,
               l.outcome, l.duration_ms, l.synthetic OR COALESCE(c.injected, false) AS synthetic,
               row_number() OVER combo AS position,
               COUNT(*) OVER (
                 PARTITION BY l.platform, l.device_model, l.os_version, l.app_version, l.outcome
               ) AS sample
        FROM performance_events l
        LEFT JOIN performance_events c
          ON c.user_id = l.user_id
         AND c.session_id = l.session_id
         AND c.event_type = 'FATAL_CRASH'
        WHERE l.event_type = 'COMPARISON_LOAD'
          AND l.occurred_at >= ($1::date)::timestamp AT TIME ZONE $3
          AND l.occurred_at < ($2::date + 1)::timestamp AT TIME ZONE $3
          AND ($4 OR (NOT l.synthetic AND NOT COALESCE(c.injected, false)))
        WINDOW combo AS (
          PARTITION BY l.platform, l.device_model, l.os_version, l.app_version, l.outcome
          ORDER BY l.duration_ms
        )
      )
      SELECT platform, device_model, os_version, app_version,
             COUNT(*) FILTER (WHERE outcome = 'FRESH_NETWORK')::int AS fresh,
             MAX(duration_ms) FILTER (
               WHERE outcome = 'FRESH_NETWORK' AND position = (95 * sample + 99) / 100
             ) AS p95_ms,
             COUNT(*) FILTER (WHERE outcome = 'CACHED_RESTORE')::int AS cached,
             COUNT(*) FILTER (WHERE outcome = 'OFFLINE_HISTORY')::int AS offline,
             COUNT(*) FILTER (WHERE outcome = 'ERROR')::int AS errors,
             COUNT(*) FILTER (WHERE outcome = 'TIMEOUT')::int AS timeouts,
             COUNT(*) FILTER (WHERE outcome = 'CANCELLED')::int AS cancelled,
             bool_or(synthetic) AS synthetic
      FROM window_loads
      GROUP BY platform, device_model, os_version, app_version
      `,
      [query.from, query.to, this.timezone, includeSynthetic],
    );
  }

  private async coverage(
    query: PerformanceQueryDto,
    to: CalendarDate,
    includeSynthetic: boolean,
  ): Promise<PerformanceCoverageDto> {
    const bounds = `
      e.occurred_at >= ($1::date)::timestamp AT TIME ZONE $3
      AND e.occurred_at < ($2::date + 1)::timestamp AT TIME ZONE $3`;
    const params = [query.from, query.to, this.timezone, includeSynthetic];

    const [[totals], platforms, [injected]] = await Promise.all([
      this.dataSource.query<CoverageRow[]>(
        `
        SELECT COUNT(*)::int AS events,
               COUNT(*) FILTER (
                 WHERE e.event_type = 'FATAL_CRASH' AND NOT EXISTS (
                   SELECT 1 FROM performance_events s
                   WHERE s.user_id = e.user_id AND s.session_id = e.session_id
                     AND s.event_type = 'SESSION_START'
                 )
               )::int AS orphan_crashes,
               COUNT(*) FILTER (
                 WHERE e.received_at - e.occurred_at > make_interval(hours => $5)
               )::int AS late_events,
               MIN(e.occurred_at) AS first_occurred_at,
               MAX(e.occurred_at) AS last_occurred_at,
               MAX(e.received_at) AS last_received_at
        FROM performance_events e
        WHERE ${bounds} AND ($4 OR (NOT e.synthetic AND NOT e.injected))
        `,
        [...params, LATE_AFTER_HOURS],
      ),
      this.dataSource.query<{ platform: ClientPlatform; events: number }[]>(
        `
        SELECT e.platform, COUNT(*)::int AS events
        FROM performance_events e
        WHERE ${bounds} AND ($4 OR (NOT e.synthetic AND NOT e.injected))
        GROUP BY e.platform
        ORDER BY e.platform
        `,
        params,
      ),
      this.dataSource.query<{ sessions: number }[]>(
        `
        SELECT COUNT(*)::int AS sessions
        FROM performance_events e
        JOIN performance_events c
          ON c.user_id = e.user_id AND c.session_id = e.session_id
         AND c.event_type = 'FATAL_CRASH' AND c.injected
        WHERE e.event_type = 'SESSION_START' AND NOT e.synthetic
          AND ${bounds} AND NOT $4
        `,
        params,
      ),
    ]);

    return {
      events: totals.events,
      platforms,
      crashesWithoutSession: totals.orphan_crashes,
      lateEvents: totals.late_events,
      excludedInjectedSessions: injected.sessions,
      firstOccurredAt: totals.first_occurred_at?.toISOString() ?? null,
      lastOccurredAt: totals.last_occurred_at?.toISOString() ?? null,
      lastReceivedAt: totals.last_received_at?.toISOString() ?? null,
      lateSyncPossibleUntil: formatCalendarDate(
        addCalendarDays(to, MAX_EVENT_AGE_DAYS),
      ),
    };
  }
}

/** A field of another record type is a client bug: rejected instead of silently dropped. */
function rejectForeignFields(dto: CreatePerformanceEventDto): void {
  const isLoad = dto.eventType === PerformanceEventType.COMPARISON_LOAD;
  const isCrash = dto.eventType === PerformanceEventType.FATAL_CRASH;
  const forbidden: [string, boolean][] = [
    ['loadId', !isLoad && dto.loadId != null],
    ['durationMs', !isLoad && dto.durationMs != null],
    ['outcome', !isLoad && dto.outcome != null],
    ['exceptionClass', !isCrash && dto.exceptionClass != null],
    ['injected', !isCrash && dto.injected === true],
  ];
  for (const [field, present] of forbidden) {
    if (present) {
      throw invalid(`${field} is not allowed for ${dto.eventType}`);
    }
  }
  if (
    isLoad &&
    dto.screen != null &&
    dto.screen !== PerformanceScreen.MEAL_COMPARISON
  ) {
    throw invalid('screen must be MEAL_COMPARISON for COMPARISON_LOAD');
  }
}

function confidence(sample: number, minimum: number): SampleConfidence {
  if (sample === 0) return SampleConfidence.NO_DATA;
  return sample < minimum
    ? SampleConfidence.INSUFFICIENT
    : SampleConfidence.SUFFICIENT;
}

function combine(
  sessions: SessionRow[],
  loads: LoadRow[],
): PerformanceCombinationDto[] {
  const keyOf = (row: CombinationKey) =>
    JSON.stringify([
      row.platform,
      row.device_model,
      row.os_version,
      row.app_version,
    ]);
  const sessionBy = new Map(sessions.map((row) => [keyOf(row), row]));
  const loadBy = new Map(loads.map((row) => [keyOf(row), row]));
  const keys = new Map<string, CombinationKey>(
    [...sessions, ...loads].map((row) => [keyOf(row), row]),
  );

  return [...keys.entries()]
    .map(([key, combo]) =>
      toCombination(combo, sessionBy.get(key), loadBy.get(key)),
    )
    .sort(
      (a, b) =>
        Number(b.flagged) - Number(a.flagged) ||
        compare(a.platform, b.platform) ||
        compare(a.deviceModel, b.deviceModel) ||
        compare(a.osVersion, b.osVersion) ||
        compare(a.appVersion, b.appVersion),
    );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toCombination(
  combo: CombinationKey,
  session: SessionRow | undefined,
  load: LoadRow | undefined,
): PerformanceCombinationDto {
  const started = session?.started ?? 0;
  const crashed = session?.crashed ?? 0;
  const fresh = load?.fresh ?? 0;
  const p95Ms = load?.p95_ms ?? null;
  const errors = load?.errors ?? 0;
  const timeouts = load?.timeouts ?? 0;
  const attempts = fresh + errors + timeouts;
  // Integers on both sides: exactly 1/100 is not above 1%.
  const crashFlagged = crashed * 100 > started;
  const p95Flagged = p95Ms !== null && p95Ms > P95_THRESHOLD_MS;

  return {
    platform: combo.platform,
    deviceModel: combo.device_model,
    osVersion: combo.os_version,
    appVersion: combo.app_version,
    flagged: crashFlagged || p95Flagged,
    sessions: {
      started,
      crashed,
      distinctUsers: session?.users ?? 0,
      crashRate: started === 0 ? null : round(crashed / started, 4),
      confidence: confidence(started, MIN_SESSIONS),
      flagged: crashFlagged,
    },
    loading: {
      freshNetwork: fresh,
      p95Ms,
      confidence: confidence(fresh, MIN_FRESH_LOADS),
      flagged: p95Flagged,
      cachedRestore: load?.cached ?? 0,
      offlineHistory: load?.offline ?? 0,
      errors,
      timeouts,
      cancelled: load?.cancelled ?? 0,
      failureRate:
        attempts === 0 ? null : round((errors + timeouts) / attempts, 4),
    },
    synthetic: (session?.synthetic ?? false) || (load?.synthetic ?? false),
  };
}
