import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_WITHIN_DAYS = 3;
export const MAX_WITHIN_DAYS = 30;

export class ExpiringInventoryQueryDto {
  @ApiPropertyOptional({
    example: DEFAULT_WITHIN_DAYS,
    default: DEFAULT_WITHIN_DAYS,
    minimum: 0,
    maximum: MAX_WITHIN_DAYS,
    description:
      'Inclusive size of the expiration window in calendar days. 0 returns only items expiring today.',
  })
  @IsOptional()
  // Query values arrive as strings; anything non-numeric becomes NaN and fails @IsInt.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @IsInt()
  @Min(0)
  @Max(MAX_WITHIN_DAYS)
  withinDays: number = DEFAULT_WITHIN_DAYS;
}
