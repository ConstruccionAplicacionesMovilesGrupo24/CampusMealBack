import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional, Matches } from 'class-validator';
import { QueryBoolean } from '../../common/validation/query-boolean';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PerformanceQueryDto {
  @ApiProperty({
    example: '2026-11-01',
    description: 'YYYY-MM-DD, inclusive, in America/Bogota.',
  })
  @IsISO8601({ strict: true })
  @Matches(CALENDAR_DATE, {
    message: 'from must be a date in YYYY-MM-DD format',
  })
  from: string;

  @ApiProperty({
    example: '2026-11-20',
    description: 'YYYY-MM-DD, inclusive, in America/Bogota. Not after today.',
  })
  @IsISO8601({ strict: true })
  @Matches(CALENDAR_DATE, {
    message: 'to must be a date in YYYY-MM-DD format',
  })
  to: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Include demo rows (seed:bq1) and sessions with an injected crash. Off by default: they are not real usage.',
  })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  includeSynthetic?: boolean;
}
