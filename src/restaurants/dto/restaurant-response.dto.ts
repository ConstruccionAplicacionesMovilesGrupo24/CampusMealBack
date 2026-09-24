import { ApiProperty } from '@nestjs/swagger';
import { RouteProviderStatus } from '../../routes/domain/route-provider.port';
import { DietaryTag } from '../enums/dietary-tag.enum';
import { OpeningStatus } from '../opening-hours';

export class RestaurantDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty({ enum: OpeningStatus })
  openingStatus: OpeningStatus;

  @ApiProperty({ type: Number, nullable: true })
  walkingMinutes: number | null;

  @ApiProperty({ type: Number, nullable: true })
  estimatedTotalMinutes: number | null;

  @ApiProperty({ description: 'Whole COP.' })
  minimumMealPrice: number;

  @ApiProperty({ enum: DietaryTag, isArray: true })
  dietaryTags: DietaryTag[];

  @ApiProperty()
  averageRating: number;

  @ApiProperty()
  recommendationReason: string;
}

export class MealDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ description: 'Whole COP.' })
  price: number;

  @ApiProperty({ enum: DietaryTag, isArray: true })
  dietaryTags: DietaryTag[];
}

export class RestaurantSearchResponseDto {
  @ApiProperty({ type: [RestaurantDto] })
  restaurants: RestaurantDto[];

  @ApiProperty({ example: '2026-09-21T17:30:02.000Z' })
  lastUpdatedAt: string;

  @ApiProperty({ enum: RouteProviderStatus })
  routeProviderStatus: RouteProviderStatus;
}

export class RestaurantDetailResponseDto {
  @ApiProperty({ type: RestaurantDto })
  restaurant: RestaurantDto;

  @ApiProperty()
  address: string;

  @ApiProperty({ type: [MealDto] })
  meals: MealDto[];

  @ApiProperty({ example: '2026-09-21T17:30:02.000Z' })
  lastUpdatedAt: string;

  @ApiProperty({ enum: RouteProviderStatus })
  routeProviderStatus: RouteProviderStatus;
}
