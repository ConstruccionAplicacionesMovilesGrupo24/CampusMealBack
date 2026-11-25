import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsUUID, Matches, Max, Min } from 'class-validator';

const score = (name: string) =>
  ApiProperty({
    minimum: 1,
    maximum: 5,
    example: 4,
    description: `${name}, 1-5`,
  });

/**
 * Body of `POST restaurants/:restaurantId/reviews`. Structured scores only: no free text, no
 * coordinates, no author field (the author is the access token's user). Unknown fields are
 * rejected by the global whitelist.
 */
export class CreateReviewDto {
  @ApiProperty({
    example: '3f1c2b9e-7a54-4d0e-9b61-2c8e5f7a1d03',
    description:
      'UUID generated once by the client for this review. Re-sending it after a lost acknowledgement returns the stored review.',
  })
  @IsUUID()
  clientReviewId: string;

  @score('Overall experience')
  @IsInt()
  @Min(1)
  @Max(5)
  overall: number;

  @score('Portion size')
  @IsInt()
  @Min(1)
  @Max(5)
  portion: number;

  @score('Taste')
  @IsInt()
  @Min(1)
  @Max(5)
  taste: number;

  @score('Perceived freshness')
  @IsInt()
  @Min(1)
  @Max(5)
  freshness: number;

  @score('Value for money')
  @IsInt()
  @Min(1)
  @Max(5)
  value: number;

  @ApiProperty({
    minimum: 0,
    maximum: 180,
    example: 12,
    description: 'Observed waiting minutes, 0-180.',
  })
  @IsInt()
  @Min(0)
  @Max(180)
  waitMinutes: number;

  @ApiProperty({
    example: '2026-11-23T17:05:00Z',
    description:
      'ISO-8601 UTC instant of the visit, ending in Z. At most 5 minutes in the future and 30 days old. Its America/Bogota date is the review day.',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/Z$/, {
    message: 'occurredAt must be an ISO-8601 UTC instant ending in Z',
  })
  occurredAt: string;
}
