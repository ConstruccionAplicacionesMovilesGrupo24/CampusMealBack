import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/** `month` is a calendar month in APP_TIMEZONE (America/Bogota). */
export class FeatureAdoptionQueryDto {
  @ApiProperty({
    example: '2026-10',
    description: 'Calendar month as YYYY-MM in America/Bogota.',
  })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in YYYY-MM format',
  })
  month: string;
}
