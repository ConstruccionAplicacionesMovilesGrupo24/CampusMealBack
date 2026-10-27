import { ApiProperty } from '@nestjs/swagger';
import { UsageFeature } from '../enums/usage-feature.enum';

export class FeatureAdoptionResultDto {
  @ApiProperty({ enum: UsageFeature })
  feature: UsageFeature;

  @ApiProperty({
    example: 8,
    description:
      'Monthly active users who used the feature fewer than 2 times (zero uses included).',
  })
  lowUseUsers: number;

  @ApiProperty({
    example: 0.8,
    description: 'lowUseUsers ÷ monthlyActiveUsers, rounded to 4 decimals.',
  })
  lowUseRate: number;

  @ApiProperty({
    example: true,
    description: 'True when lowUseRate is at least 0.80 (BQ6 answer).',
  })
  flagged: boolean;
}

export class FeatureAdoptionResponseDto {
  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({
    enum: ['OK', 'NO_DATA'],
    description:
      'NO_DATA when the month has no active users (no division by zero).',
  })
  status: 'OK' | 'NO_DATA';

  @ApiProperty({
    example: 10,
    description:
      'Accounts with at least one valid usage event whose occurredAt falls in the month.',
  })
  monthlyActiveUsers: number;

  @ApiProperty({ example: 0.8 })
  threshold: number;

  @ApiProperty({
    example: 2,
    description: 'A user is low-use below this many uses.',
  })
  lowUseBelowUses: number;

  @ApiProperty({
    description:
      'True while the requested month is the current month in Bogotá.',
  })
  partialMonth: boolean;

  @ApiProperty({
    example: 86,
    description: 'Usage events stored for the month so far.',
  })
  eventsReceived: number;

  @ApiProperty({
    description: 'True when some counted events come from demo seed data.',
  })
  includesSyntheticData: boolean;

  @ApiProperty({ example: '2026-10-27T15:00:00.000Z' })
  generatedAt: string;

  @ApiProperty({ type: FeatureAdoptionResultDto, isArray: true })
  results: FeatureAdoptionResultDto[];
}
