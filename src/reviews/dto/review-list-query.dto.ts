import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { QueryBoolean } from '../../common/validation/query-boolean';

export class ReviewListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Include deterministic demo reviews (seed:bq13). Off by default so students never see them as real.',
  })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  includeSynthetic?: boolean;
}
