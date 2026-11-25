import { ApiProperty } from '@nestjs/swagger';
import { ClientPlatform } from '../enums/client-platform.enum';

export const PERFORMANCE_CONTRACT_VERSION = 1;
/** BQ1 thresholds: a combination is flagged strictly above them. */
export const CRASH_RATE_THRESHOLD = 0.01;
export const P95_THRESHOLD_MS = 2000;
/** With fewer sessions one crash alone is above 1%. */
export const MIN_SESSIONS = 100;
/** With fewer loads the nearest-rank p95 is simply the slowest load. */
export const MIN_FRESH_LOADS = 20;

export enum SampleConfidence {
  /** Zero denominator: the metric is null. */
  NO_DATA = 'NO_DATA',
  /** A value exists, but the sample is too small to describe the combination. */
  INSUFFICIENT = 'INSUFFICIENT',
  SUFFICIENT = 'SUFFICIENT',
}

export class PerformanceThresholdsDto {
  @ApiProperty({ example: CRASH_RATE_THRESHOLD })
  crashRate: number;

  @ApiProperty({ example: P95_THRESHOLD_MS })
  p95Ms: number;

  @ApiProperty({ example: 'STRICTLY_ABOVE' })
  comparison: string;
}

export class PerformanceSamplePolicyDto {
  @ApiProperty({ example: MIN_SESSIONS })
  minSessions: number;

  @ApiProperty({ example: MIN_FRESH_LOADS })
  minFreshLoads: number;
}

export class SessionHealthDto {
  @ApiProperty({ description: 'Distinct recorded started sessions.' })
  started: number;

  @ApiProperty({
    description: 'Started sessions with a captured fatal crash (once each).',
  })
  crashed: number;

  @ApiProperty({ description: 'Distinct accounts behind the sessions.' })
  distinctUsers: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'crashed ÷ started; null without sessions.',
  })
  crashRate: number | null;

  @ApiProperty({ enum: SampleConfidence })
  confidence: SampleConfidence;

  @ApiProperty({ description: 'crashRate strictly above 0.01.' })
  flagged: boolean;
}

export class ComparisonLoadingDto {
  @ApiProperty({
    description: 'Successful fresh-network loads: the only p95 sample.',
  })
  freshNetwork: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Nearest-rank p95 of fresh-network loads; null without them.',
  })
  p95Ms: number | null;

  @ApiProperty({ enum: SampleConfidence })
  confidence: SampleConfidence;

  @ApiProperty({ description: 'p95Ms strictly above 2000.' })
  flagged: boolean;

  @ApiProperty()
  cachedRestore: number;

  @ApiProperty()
  offlineHistory: number;

  @ApiProperty()
  errors: number;

  @ApiProperty()
  timeouts: number;

  @ApiProperty()
  cancelled: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      '(errors + timeouts) ÷ (freshNetwork + errors + timeouts). Shown because failed loads are not in the p95 (survivorship bias).',
  })
  failureRate: number | null;
}

export class PerformanceCombinationDto {
  @ApiProperty({ enum: ClientPlatform })
  platform: ClientPlatform;

  @ApiProperty({ example: 'Pixel 8' })
  deviceModel: string;

  @ApiProperty({ example: 'Android 16' })
  osVersion: string;

  @ApiProperty({ example: '0.5.0' })
  appVersion: string;

  @ApiProperty({ description: 'Either metric is strictly above its limit.' })
  flagged: boolean;

  @ApiProperty({ type: SessionHealthDto })
  sessions: SessionHealthDto;

  @ApiProperty({ type: ComparisonLoadingDto })
  loading: ComparisonLoadingDto;

  @ApiProperty({
    description: 'Contains demo rows or sessions with an injected crash.',
  })
  synthetic: boolean;
}

export class PerformancePlatformCoverageDto {
  @ApiProperty({ enum: ClientPlatform })
  platform: ClientPlatform;

  @ApiProperty()
  events: number;
}

export class PerformanceCoverageDto {
  @ApiProperty({ description: 'Records in the window (any type).' })
  events: number;

  @ApiProperty({ type: [PerformancePlatformCoverageDto] })
  platforms: PerformancePlatformCoverageDto[];

  @ApiProperty({
    description:
      'Crashes whose session start was never received. They are left out of crashRate so it cannot exceed 1.',
  })
  crashesWithoutSession: number;

  @ApiProperty({
    description:
      'Records received more than 24 hours after they happened (offline devices).',
  })
  lateEvents: number;

  @ApiProperty({
    description:
      'Sessions left out because their crash was injected on purpose. 0 when includeSynthetic is true.',
  })
  excludedInjectedSessions: number;

  @ApiProperty({ type: String, nullable: true })
  firstOccurredAt: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastOccurredAt: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastReceivedAt: string | null;

  @ApiProperty({
    example: '2027-02-18',
    description:
      'Until this Bogotá date a device that was offline may still deliver records of this window.',
  })
  lateSyncPossibleUntil: string;
}

export class PerformanceResponseDto {
  @ApiProperty({ example: PERFORMANCE_CONTRACT_VERSION })
  contractVersion: number;

  @ApiProperty({ example: '2026-11-01' })
  from: string;

  @ApiProperty({ example: '2026-11-20' })
  to: string;

  @ApiProperty()
  generatedAt: string;

  @ApiProperty()
  includeSynthetic: boolean;

  @ApiProperty()
  includesSyntheticData: boolean;

  @ApiProperty({ type: PerformanceThresholdsDto })
  thresholds: PerformanceThresholdsDto;

  @ApiProperty({ type: PerformanceSamplePolicyDto })
  samplePolicy: PerformanceSamplePolicyDto;

  @ApiProperty({
    type: [PerformanceCombinationDto],
    description: 'Flagged combinations first.',
  })
  combinations: PerformanceCombinationDto[];

  @ApiProperty({ type: PerformanceCoverageDto })
  coverage: PerformanceCoverageDto;

  @ApiProperty({ type: [String] })
  limitations: string[];
}
