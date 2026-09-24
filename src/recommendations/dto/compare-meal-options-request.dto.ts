import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DietaryTag } from '../../restaurants/enums/dietary-tag.enum';

// Own location DTO (not reused from restaurants/) so this module doesn't depend on the
// Restaurants module's HTTP-shaped types — same fields as SearchRestaurantsDto by contract,
// not by import.
export class MealDecisionLocationDto {
  @ApiProperty({ example: 4.6025, minimum: -90, maximum: 90 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: -74.0653, minimum: -180, maximum: 180 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude: number;
}

export class CompareMealOptionsRequestDto {
  @ApiProperty({ type: MealDecisionLocationDto })
  @ValidateNested()
  @Type(() => MealDecisionLocationDto)
  location: MealDecisionLocationDto;

  @ApiPropertyOptional({ example: 'campus-001', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  campusId?: string | null;

  @ApiProperty({ example: 45, minimum: 1 })
  @IsInt()
  @Min(1)
  availableMinutes: number;

  @ApiProperty({ example: 20000, minimum: 0, description: 'Whole COP.' })
  @IsInt()
  @Min(0)
  maximumBudget: number;

  @ApiProperty({
    enum: DietaryTag,
    isArray: true,
    example: [DietaryTag.VEGETARIAN],
  })
  @IsArray()
  @IsEnum(DietaryTag, { each: true })
  dietaryPreferences: DietaryTag[];

  @ApiProperty({ example: true })
  @IsBoolean()
  includeDelivery: boolean;

  @ApiProperty({
    example: '2026-09-21T17:30:00Z',
    description: 'ISO-8601 UTC instant. A Z suffix is required.',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/Z$/, {
    message: 'requestedAt must be an ISO-8601 UTC instant ending in Z',
  })
  requestedAt: string;
}
