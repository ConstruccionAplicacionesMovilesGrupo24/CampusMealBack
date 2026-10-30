import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, Matches } from 'class-validator';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ZoneDemandQueryDto {
  @ApiProperty({
    example: '2026-10-01',
    description: 'YYYY-MM-DD, inclusive, in America/Bogota.',
  })
  @IsISO8601({ strict: true })
  @Matches(CALENDAR_DATE, {
    message: 'from must be a date in YYYY-MM-DD format',
  })
  from: string;

  @ApiProperty({
    example: '2026-10-31',
    description: 'YYYY-MM-DD, inclusive, in America/Bogota.',
  })
  @IsISO8601({ strict: true })
  @Matches(CALENDAR_DATE, {
    message: 'to must be a date in YYYY-MM-DD format',
  })
  to: string;
}
