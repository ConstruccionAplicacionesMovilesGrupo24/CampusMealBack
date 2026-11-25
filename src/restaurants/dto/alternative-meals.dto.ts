import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsEnum, ValidateNested } from 'class-validator';
import { RouteProviderStatus } from '../../routes/domain/route-provider.port';
import { MealCategory } from '../enums/meal-category.enum';
import { MealDto, RestaurantDto } from './restaurant-response.dto';
import {
  RestaurantSearchLocationDto,
  SearchRestaurantsDto,
} from './search-restaurants.dto';

export class AlternativeMealsRequestDto extends OmitType(SearchRestaurantsDto, [
  'foodCategory',
  'location',
] as const) {
  @ApiProperty({ enum: MealCategory })
  @IsDefined()
  @IsEnum(MealCategory)
  foodCategory: MealCategory;

  @ApiProperty({ type: RestaurantSearchLocationDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RestaurantSearchLocationDto)
  location: RestaurantSearchLocationDto;
}

export class AlternativeMealDto {
  @ApiProperty({ type: RestaurantDto }) restaurant: RestaurantDto;
  @ApiProperty({ type: MealDto }) meal: MealDto;
  @ApiProperty({ enum: MealCategory }) substituteCategory: MealCategory;
  @ApiProperty() explanation: string;
  @ApiProperty() budgetCompatible: boolean;
  @ApiProperty() dietCompatible: boolean;
  @ApiProperty() timeCompatible: boolean;
}

export enum AlternativesStatus {
  FOUND = 'FOUND',
  NO_COMPATIBLE_ALTERNATIVE = 'NO_COMPATIBLE_ALTERNATIVE',
  REACHABILITY_UNCONFIRMED = 'REACHABILITY_UNCONFIRMED',
}

export class AlternativeMealsResponseDto {
  @ApiProperty() contractVersion: number;
  @ApiProperty() generatedAt: string;
  @ApiProperty() asOf: string;
  @ApiProperty({ enum: MealCategory }) requestedCategory: MealCategory;
  @ApiProperty({ enum: AlternativesStatus }) status: AlternativesStatus;
  @ApiProperty({ enum: RouteProviderStatus })
  routeProviderStatus: RouteProviderStatus;
  @ApiProperty({ type: [AlternativeMealDto] })
  alternatives: AlternativeMealDto[];
}
