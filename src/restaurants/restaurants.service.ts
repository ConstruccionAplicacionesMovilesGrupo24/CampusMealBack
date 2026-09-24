import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ROUTE_PROVIDER_PORT,
  RouteProviderStatus,
} from '../routes/domain/route-provider.port';
import type { RouteProviderPort } from '../routes/domain/route-provider.port';
import {
  MealDto,
  RestaurantDetailResponseDto,
  RestaurantDto,
  RestaurantSearchResponseDto,
} from './dto/restaurant-response.dto';
import { SearchRestaurantsDto } from './dto/search-restaurants.dto';
import { Meal } from './entities/meal.entity';
import { Restaurant } from './entities/restaurant.entity';
import { DietaryTag } from './enums/dietary-tag.enum';
import { evaluateOpeningStatus, OpeningStatus } from './opening-hours';

const DEFAULT_DINING_MINUTES = 15;

interface Candidate {
  restaurant: Restaurant;
  meals: Meal[];
  openingStatus: OpeningStatus;
}

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    @InjectRepository(Meal)
    private readonly mealRepository: Repository<Meal>,
    @Inject(ROUTE_PROVIDER_PORT)
    private readonly routeProvider: RouteProviderPort,
  ) {}

  async search(
    dto: SearchRestaurantsDto,
  ): Promise<RestaurantSearchResponseDto> {
    const requestedAt = new Date(dto.requestedAt);
    const restaurants = await this.restaurantRepository.find({
      where: { active: true },
      order: { name: 'ASC', id: 'ASC' },
    });
    const meals = await this.mealRepository.find({
      where: { available: true },
    });
    const mealsByRestaurant = groupMeals(meals);

    const candidates: Candidate[] = [];
    for (const restaurant of restaurants) {
      const openingStatus = evaluateOpeningStatus(
        restaurant.openingHours,
        requestedAt,
      );
      if (openingStatus === OpeningStatus.CLOSED) {
        continue;
      }

      const eligibleMeals = (mealsByRestaurant.get(restaurant.id) ?? []).filter(
        (meal) =>
          meal.price <= dto.maximumBudget &&
          matchesDietaryPreferences(meal, dto.dietaryPreferences),
      );
      if (eligibleMeals.length === 0) {
        continue;
      }

      candidates.push({
        restaurant,
        meals: eligibleMeals,
        openingStatus,
      });
    }

    if (candidates.length === 0) {
      return {
        restaurants: [],
        lastUpdatedAt: new Date().toISOString(),
        routeProviderStatus: RouteProviderStatus.AVAILABLE,
      };
    }

    const routeResult = await this.routeProvider.getWalkingTimes(
      dto.location,
      candidates.map(({ restaurant }) => ({
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
      })),
    );

    const results = candidates.flatMap((candidate, index) => {
      const walkingMinutes =
        routeResult.estimates[index]?.walkingMinutes ?? null;
      const estimatedTotalMinutes =
        walkingMinutes === null
          ? null
          : walkingMinutes * 2 + DEFAULT_DINING_MINUTES;

      if (
        estimatedTotalMinutes !== null &&
        estimatedTotalMinutes > dto.availableMinutes
      ) {
        return [];
      }

      return [
        toRestaurantDto(
          candidate,
          walkingMinutes,
          estimatedTotalMinutes,
          dto.dietaryPreferences.length > 0,
        ),
      ];
    });

    results.sort(compareRestaurantResults);

    return {
      restaurants: results,
      lastUpdatedAt: new Date().toISOString(),
      routeProviderStatus: routeResult.status,
    };
  }

  async getDetail(restaurantId: string): Promise<RestaurantDetailResponseDto> {
    const restaurant = await this.restaurantRepository.findOne({
      where: { id: restaurantId, active: true },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const meals = await this.mealRepository.find({
      where: { restaurantId, available: true },
      order: { price: 'ASC', name: 'ASC', id: 'ASC' },
    });
    const openingStatus = evaluateOpeningStatus(
      restaurant.openingHours,
      new Date(),
    );
    const minimumMealPrice =
      meals.length === 0 ? 0 : Math.min(...meals.map((meal) => meal.price));

    const summary: RestaurantDto = {
      id: restaurant.id,
      name: restaurant.name,
      category: restaurant.category,
      openingStatus,
      walkingMinutes: null,
      estimatedTotalMinutes: null,
      minimumMealPrice,
      dietaryTags: uniqueDietaryTags(meals),
      averageRating: restaurant.averageRating,
      recommendationReason:
        'Restaurant details are available; route context is not part of this detail request.',
    };

    return {
      restaurant: summary,
      address: restaurant.address,
      meals: meals.map(toMealDto),
      lastUpdatedAt: latestUpdatedAt(restaurant, meals).toISOString(),
      routeProviderStatus: RouteProviderStatus.UNAVAILABLE,
    };
  }
}

function groupMeals(meals: Meal[]): Map<string, Meal[]> {
  const grouped = new Map<string, Meal[]>();
  for (const meal of meals) {
    const group = grouped.get(meal.restaurantId) ?? [];
    group.push(meal);
    grouped.set(meal.restaurantId, group);
  }
  return grouped;
}

function matchesDietaryPreferences(
  meal: Meal,
  preferences: DietaryTag[],
): boolean {
  return preferences.every((preference) =>
    meal.dietaryTags.includes(preference),
  );
}

function toRestaurantDto(
  candidate: Candidate,
  walkingMinutes: number | null,
  estimatedTotalMinutes: number | null,
  hasDietaryPreferences: boolean,
): RestaurantDto {
  const minimumMealPrice = Math.min(
    ...candidate.meals.map((meal) => meal.price),
  );

  return {
    id: candidate.restaurant.id,
    name: candidate.restaurant.name,
    category: candidate.restaurant.category,
    openingStatus: candidate.openingStatus,
    walkingMinutes,
    estimatedTotalMinutes,
    minimumMealPrice,
    dietaryTags: uniqueDietaryTags(candidate.meals),
    averageRating: candidate.restaurant.averageRating,
    recommendationReason: recommendationReason(
      walkingMinutes,
      hasDietaryPreferences,
    ),
  };
}

function recommendationReason(
  walkingMinutes: number | null,
  hasDietaryPreferences: boolean,
): string {
  if (walkingMinutes === null) {
    return hasDietaryPreferences
      ? 'Matches the budget and dietary preferences; walking time is currently unavailable.'
      : 'Matches the budget; walking time is currently unavailable.';
  }

  return hasDietaryPreferences
    ? 'Fits the available time, budget and dietary preferences.'
    : 'Fits the available time and budget.';
}

function uniqueDietaryTags(meals: Meal[]): DietaryTag[] {
  return Array.from(new Set(meals.flatMap((meal) => meal.dietaryTags))).sort();
}

function toMealDto(meal: Meal): MealDto {
  return {
    id: meal.id,
    name: meal.name,
    price: meal.price,
    dietaryTags: [...meal.dietaryTags].sort(),
  };
}

function compareRestaurantResults(a: RestaurantDto, b: RestaurantDto): number {
  const aHasRoute = a.estimatedTotalMinutes !== null;
  const bHasRoute = b.estimatedTotalMinutes !== null;
  if (aHasRoute !== bHasRoute) {
    return aHasRoute ? -1 : 1;
  }

  if (
    a.estimatedTotalMinutes !== null &&
    b.estimatedTotalMinutes !== null &&
    a.estimatedTotalMinutes !== b.estimatedTotalMinutes
  ) {
    return a.estimatedTotalMinutes - b.estimatedTotalMinutes;
  }

  if (a.minimumMealPrice !== b.minimumMealPrice) {
    return a.minimumMealPrice - b.minimumMealPrice;
  }

  if (a.averageRating !== b.averageRating) {
    return b.averageRating - a.averageRating;
  }

  const nameComparison = a.name.localeCompare(b.name);
  return nameComparison !== 0 ? nameComparison : a.id.localeCompare(b.id);
}

function latestUpdatedAt(restaurant: Restaurant, meals: Meal[]): Date {
  return [restaurant.updatedAt, ...meals.map((meal) => meal.updatedAt)].reduce(
    (latest, current) => (current > latest ? current : latest),
  );
}
