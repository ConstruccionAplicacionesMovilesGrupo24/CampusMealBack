import { ApiProperty } from '@nestjs/swagger';
import { MealAlternative } from '../enums/meal-alternative.enum';

export class ExpiringIngredientDto {
  @ApiProperty({ format: 'uuid' })
  itemId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  remainingDays: number;
}

export class AlternativeRestaurantDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: Number, nullable: true })
  walkingMinutes: number | null;

  @ApiProperty({ type: Number, nullable: true })
  deliveryMinutes: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Whole COP.' })
  deliveryFee: number | null;
}

export class RecommendationAlternativeDto {
  @ApiProperty({ enum: MealAlternative })
  type: MealAlternative;

  @ApiProperty({ minimum: 1 })
  rank: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  score: number;

  @ApiProperty()
  recommended: boolean;

  @ApiProperty()
  estimatedMinutes: number;

  @ApiProperty({ description: 'Whole COP.' })
  estimatedCost: number;

  @ApiProperty({ type: [ExpiringIngredientDto], nullable: true })
  expiringIngredients: ExpiringIngredientDto[] | null;

  @ApiProperty({ type: AlternativeRestaurantDto, nullable: true })
  restaurant: AlternativeRestaurantDto | null;
}

export class CompareMealOptionsResponseDto {
  @ApiProperty({ format: 'uuid' })
  recommendationId: string;

  @ApiProperty({
    type: [RecommendationAlternativeDto],
    description: 'In rank order. Empty when no alternative is currently available.',
  })
  alternatives: RecommendationAlternativeDto[];

  @ApiProperty()
  mainExplanation: string;

  @ApiProperty({ type: [String] })
  supportingReasons: string[];
}
