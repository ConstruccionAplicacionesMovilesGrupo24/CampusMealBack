import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, Matches } from 'class-validator';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `from` and `to` are calendar dates in APP_TIMEZONE (America/Bogota), both inclusive. */
export class ExplanationSelectionQueryDto {
  @ApiProperty({ example: '2026-09-01', description: 'YYYY-MM-DD, inclusive.' })
  @IsISO8601({ strict: true })
  @Matches(CALENDAR_DATE, {
    message: 'from must be a date in YYYY-MM-DD format',
  })
  from: string;

  @ApiProperty({ example: '2026-09-30', description: 'YYYY-MM-DD, inclusive.' })
  @IsISO8601({ strict: true })
  @Matches(CALENDAR_DATE, { message: 'to must be a date in YYYY-MM-DD format' })
  to: string;
}
