import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryService } from '../inventory/inventory.service';
import { Meal } from '../restaurants/entities/meal.entity';
import { Restaurant } from '../restaurants/entities/restaurant.entity';
import { evaluateOpeningStatus, OpeningStatus } from '../restaurants/opening-hours';
import { ROUTE_PROVIDER_PORT } from '../routes/domain/route-provider.port';
import type { RouteProviderPort } from '../routes/domain/route-provider.port';
import { CompareMealOptionsRequestDto } from './dto/compare-meal-options-request.dto';
import {
  CompareMealOptionsResponseDto,
  RecommendationAlternativeDto,
} from './dto/compare-meal-options-response.dto';
import { ExplanationType } from './enums/explanation-type.enum';
import { MealAlternative } from './enums/meal-alternative.enum';
import { Candidate, RankedAlternative, ScoredCandidate } from './recommendation-candidate';
import { RecommendationsRepository } from './recommendations.repository';
import { BudgetFitStrategy } from './strategies/budget-fit.strategy';
import { ContextCompatibilityStrategy } from './strategies/context-compatibility.strategy';
import { ExpirationPriorityStrategy } from './strategies/expiration-priority.strategy';
import { RecommendationStrategy } from './strategies/recommendation-strategy.interface';
import { TimeFitStrategy } from './strategies/time-fit.strategy';

// Documented assumptions (issue #6 gives no exact formula for Cook, unlike Walk/Order which
// reuse #5's route-based estimate):
const COOK_ESTIMATED_MINUTES = 20; // typical home-cooked meal preparation time.
const COOK_ESTIMATED_COST = 0; // uses ingredients the user already owns; no purchase assumed.
const WALK_DINING_MINUTES = 15; // matches RestaurantsService's estimatedTotalMinutes formula (#5).
const INVENTORY_EXPIRATION_WINDOW_DAYS = 3;
const SUPPORTING_REASON_THRESHOLD = 60;

const TYPE_ORDER: Record<MealAlternative, number> = {
  [MealAlternative.COOK]: 0,
  [MealAlternative.WALK]: 1,
  [MealAlternative.ORDER]: 2,
};

const NO_OPTIONS_EXPLANATION =
  'No cooking, walking or delivery alternative currently fits your available time and budget.';

interface EligibleRestaurant {
  restaurant: Restaurant;
  minimumMealPrice: number;
}

/**
 * BQ5 orchestrator (issue #6). Builds up to one candidate per alternative type, scores each
 * with the four Strategy-pattern implementations, ranks them, and persists the run. The
 * backend owns the entire comparison — mobile clients only ever display this result.
 */
@Injectable()
export class RecommendationsService {
  private readonly strategies: RecommendationStrategy[] = [
    new TimeFitStrategy(),
    new BudgetFitStrategy(),
    new ExpirationPriorityStrategy(),
    new ContextCompatibilityStrategy(),
  ];

  constructor(
    private readonly inventoryService: InventoryService,
    @InjectRepository(Restaurant)
    private readonly restaurantRepository: Repository<Restaurant>,
    @InjectRepository(Meal)
    private readonly mealRepository: Repository<Meal>,
    @Inject(ROUTE_PROVIDER_PORT)
    private readonly routeProvider: RouteProviderPort,
    private readonly recommendationsRepository: RecommendationsRepository,
  ) {}

  async compare(
    userId: string,
    dto: CompareMealOptionsRequestDto,
  ): Promise<CompareMealOptionsResponseDto> {
    const candidates = await this.buildCandidates(userId, dto);
    const scored = candidates.map((candidate) => this.score(candidate, dto));
    const ranked = this.rank(scored);

    const winner = ranked.find((alternative) => alternative.recommended) ?? null;
    const mainExplanation = winner ? explanationText(winner) : NO_OPTIONS_EXPLANATION;
    const supportingReasons = winner ? supportingReasonsFor(winner) : [];

    const recommendationId = await this.recommendationsRepository.saveRun(
      userId,
      dto.availableMinutes,
      dto.maximumBudget,
      mainExplanation,
      winner?.explanationType ?? null,
      ranked,
    );

    return {
      recommendationId,
      alternatives: ranked.map(toAlternativeDto),
      mainExplanation,
      supportingReasons,
    };
  }

  private async buildCandidates(
    userId: string,
    dto: CompareMealOptionsRequestDto,
  ): Promise<Candidate[]> {
    const candidates: Candidate[] = [];

    const cookCandidate = await this.buildCookCandidate(userId, dto);
    if (cookCandidate) {
      candidates.push(cookCandidate);
    }

    const eligibleRestaurants = await this.eligibleRestaurants(dto);

    const walkCandidate = await this.buildWalkCandidate(eligibleRestaurants, dto);
    if (walkCandidate) {
      candidates.push(walkCandidate);
    }

    if (dto.includeDelivery) {
      const orderCandidate = this.buildOrderCandidate(eligibleRestaurants, dto);
      if (orderCandidate) {
        candidates.push(orderCandidate);
      }
    }

    return candidates;
  }

  /** Cook exists only when BQ2 has ingredients expiring within 3 days (issue #6's whole premise). */
  private async buildCookCandidate(
    userId: string,
    dto: CompareMealOptionsRequestDto,
  ): Promise<Candidate | null> {
    const expiring = await this.inventoryService.getExpiring(
      userId,
      INVENTORY_EXPIRATION_WINDOW_DAYS,
    );
    if (expiring.items.length === 0) {
      return null;
    }
    if (
      COOK_ESTIMATED_MINUTES > dto.availableMinutes ||
      COOK_ESTIMATED_COST > dto.maximumBudget
    ) {
      return null;
    }

    return {
      type: MealAlternative.COOK,
      estimatedMinutes: COOK_ESTIMATED_MINUTES,
      estimatedCost: COOK_ESTIMATED_COST,
      expiringIngredientCount: expiring.items.length,
      restaurantRating: null,
      expiringIngredients: expiring.items.map((item) => ({
        itemId: item.id,
        name: item.name,
        remainingDays: item.remainingDays,
      })),
      restaurant: null,
    };
  }

  /** Same filters as BQ4 (#5): active, not closed, at least one meal within budget and diet. */
  private async eligibleRestaurants(
    dto: CompareMealOptionsRequestDto,
  ): Promise<EligibleRestaurant[]> {
    const requestedAt = new Date(dto.requestedAt);
    const restaurants = await this.restaurantRepository.find({
      where: { active: true },
    });
    const meals = await this.mealRepository.find({ where: { available: true } });
    const mealsByRestaurant = groupMeals(meals);

    const eligible: EligibleRestaurant[] = [];
    for (const restaurant of restaurants) {
      if (
        evaluateOpeningStatus(restaurant.openingHours, requestedAt) ===
        OpeningStatus.CLOSED
      ) {
        continue;
      }

      const matchingMeals = (mealsByRestaurant.get(restaurant.id) ?? []).filter(
        (meal) =>
          meal.price <= dto.maximumBudget &&
          dto.dietaryPreferences.every((preference) =>
            meal.dietaryTags.includes(preference),
          ),
      );
      if (matchingMeals.length === 0) {
        continue;
      }

      eligible.push({
        restaurant,
        minimumMealPrice: Math.min(...matchingMeals.map((meal) => meal.price)),
      });
    }
    return eligible;
  }

  /** One request covers every eligible restaurant (issue #4 acceptance: batched, not per-restaurant). */
  private async buildWalkCandidate(
    eligible: EligibleRestaurant[],
    dto: CompareMealOptionsRequestDto,
  ): Promise<Candidate | null> {
    if (eligible.length === 0) {
      return null;
    }

    const routeResult = await this.routeProvider.getWalkingTimes(
      dto.location,
      eligible.map(({ restaurant }) => ({
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
      })),
    );

    let best: { candidate: EligibleRestaurant; walkingMinutes: number; totalMinutes: number } | null =
      null;

    for (let index = 0; index < eligible.length; index += 1) {
      const walkingMinutes = routeResult.estimates[index]?.walkingMinutes ?? null;
      if (walkingMinutes === null) {
        continue;
      }
      const totalMinutes = walkingMinutes * 2 + WALK_DINING_MINUTES;
      if (totalMinutes > dto.availableMinutes) {
        continue;
      }
      const candidate = eligible[index];
      if (!best || isBetterWalk(candidate, totalMinutes, best)) {
        best = { candidate, walkingMinutes, totalMinutes };
      }
    }

    if (!best) {
      return null;
    }

    const { candidate, walkingMinutes, totalMinutes } = best;
    return {
      type: MealAlternative.WALK,
      estimatedMinutes: totalMinutes,
      estimatedCost: candidate.minimumMealPrice,
      expiringIngredientCount: 0,
      restaurantRating: candidate.restaurant.averageRating,
      expiringIngredients: null,
      restaurant: {
        id: candidate.restaurant.id,
        name: candidate.restaurant.name,
        walkingMinutes,
        deliveryMinutes: null,
        deliveryFee: null,
      },
    };
  }

  /** No route provider needed: delivery time/fee are already stored on the restaurant (#4). */
  private buildOrderCandidate(
    eligible: EligibleRestaurant[],
    dto: CompareMealOptionsRequestDto,
  ): Candidate | null {
    const deliverable = eligible.filter((candidate) => {
      const fee = candidate.restaurant.deliveryFee ?? 0;
      return (
        candidate.restaurant.deliveryAvailable &&
        candidate.restaurant.estimatedDeliveryMinutes !== null &&
        candidate.restaurant.estimatedDeliveryMinutes <= dto.availableMinutes &&
        candidate.minimumMealPrice + fee <= dto.maximumBudget
      );
    });
    if (deliverable.length === 0) {
      return null;
    }

    let best = deliverable[0];
    for (const candidate of deliverable.slice(1)) {
      if (isBetterOrder(candidate, best)) {
        best = candidate;
      }
    }

    const deliveryFee = best.restaurant.deliveryFee ?? 0;
    return {
      type: MealAlternative.ORDER,
      estimatedMinutes: best.restaurant.estimatedDeliveryMinutes as number,
      estimatedCost: best.minimumMealPrice + deliveryFee,
      expiringIngredientCount: 0,
      restaurantRating: best.restaurant.averageRating,
      expiringIngredients: null,
      restaurant: {
        id: best.restaurant.id,
        name: best.restaurant.name,
        walkingMinutes: null,
        deliveryMinutes: best.restaurant.estimatedDeliveryMinutes,
        deliveryFee: best.restaurant.deliveryFee,
      },
    };
  }

  private score(
    candidate: Candidate,
    dto: CompareMealOptionsRequestDto,
  ): ScoredCandidate {
    const input = {
      type: candidate.type,
      estimatedMinutes: candidate.estimatedMinutes,
      estimatedCost: candidate.estimatedCost,
      availableMinutes: dto.availableMinutes,
      maximumBudget: dto.maximumBudget,
      expiringIngredientCount: candidate.expiringIngredientCount,
      restaurantRating: candidate.restaurantRating,
    };

    const strategyScores = this.strategies.map((strategy) => ({
      type: strategy.explanationType,
      score: strategy.calculate(input).value,
    }));

    const overallScore = Math.round(
      strategyScores.reduce((sum, result) => sum + result.score, 0) /
        strategyScores.length,
    );
    const dominant = strategyScores.reduce((best, current) =>
      current.score > best.score ? current : best,
    );

    return {
      ...candidate,
      score: overallScore,
      explanationType: dominant.type,
      strategyScores,
    };
  }

  /** Rank order: higher score, lower time, lower cost, stable type order COOK/WALK/ORDER (issue #6). */
  private rank(scored: ScoredCandidate[]): RankedAlternative[] {
    const ordered = [...scored].sort(compareCandidates);
    return ordered.map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      recommended: index === 0,
      metadata: buildMetadata(candidate),
    }));
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

function isBetterWalk(
  candidate: EligibleRestaurant,
  totalMinutes: number,
  current: { candidate: EligibleRestaurant; totalMinutes: number },
): boolean {
  if (totalMinutes !== current.totalMinutes) {
    return totalMinutes < current.totalMinutes;
  }
  if (candidate.minimumMealPrice !== current.candidate.minimumMealPrice) {
    return candidate.minimumMealPrice < current.candidate.minimumMealPrice;
  }
  if (
    candidate.restaurant.averageRating !== current.candidate.restaurant.averageRating
  ) {
    return candidate.restaurant.averageRating > current.candidate.restaurant.averageRating;
  }
  return candidate.restaurant.name.localeCompare(current.candidate.restaurant.name) < 0;
}

function isBetterOrder(
  candidate: EligibleRestaurant,
  current: EligibleRestaurant,
): boolean {
  const candidateMinutes = candidate.restaurant.estimatedDeliveryMinutes as number;
  const currentMinutes = current.restaurant.estimatedDeliveryMinutes as number;
  if (candidateMinutes !== currentMinutes) {
    return candidateMinutes < currentMinutes;
  }
  if (candidate.minimumMealPrice !== current.minimumMealPrice) {
    return candidate.minimumMealPrice < current.minimumMealPrice;
  }
  if (candidate.restaurant.averageRating !== current.restaurant.averageRating) {
    return candidate.restaurant.averageRating > current.restaurant.averageRating;
  }
  return candidate.restaurant.name.localeCompare(current.restaurant.name) < 0;
}

function compareCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  if (a.estimatedMinutes !== b.estimatedMinutes) {
    return a.estimatedMinutes - b.estimatedMinutes;
  }
  if (a.estimatedCost !== b.estimatedCost) {
    return a.estimatedCost - b.estimatedCost;
  }
  return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
}

function buildMetadata(
  candidate: ScoredCandidate,
): Record<string, unknown> | null {
  if (candidate.type === MealAlternative.COOK) {
    return { expiringIngredients: candidate.expiringIngredients };
  }
  return { restaurant: candidate.restaurant };
}

function toAlternativeDto(
  alternative: RankedAlternative,
): RecommendationAlternativeDto {
  return {
    type: alternative.type,
    rank: alternative.rank,
    score: alternative.score,
    recommended: alternative.recommended,
    estimatedMinutes: alternative.estimatedMinutes,
    estimatedCost: alternative.estimatedCost,
    expiringIngredients: alternative.expiringIngredients,
    restaurant: alternative.restaurant,
  };
}

function labelFor(type: MealAlternative): string {
  switch (type) {
    case MealAlternative.COOK:
      return 'Cooking';
    case MealAlternative.WALK:
      return 'Walking to a restaurant';
    case MealAlternative.ORDER:
      return 'Ordering delivery';
  }
}

function explanationText(winner: RankedAlternative): string {
  const label = labelFor(winner.type);
  switch (winner.explanationType) {
    case ExplanationType.EXPIRATION_PRIORITY:
      return `${label} is recommended because it fits the available time and uses an ingredient expiring soon.`;
    case ExplanationType.TIME_PRIORITY:
      return `${label} is recommended because it is the fastest option that fits your budget.`;
    case ExplanationType.BUDGET_PRIORITY:
      return `${label} is recommended because it is the cheapest option that fits your available time.`;
    case ExplanationType.CONTEXT_COMPATIBILITY:
      return `${label} is recommended because it best matches your current context.`;
  }
}

function reasonPhrase(type: ExplanationType): string {
  switch (type) {
    case ExplanationType.TIME_PRIORITY:
      return 'Fits comfortably within your available time';
    case ExplanationType.BUDGET_PRIORITY:
      return 'Lowest estimated cost';
    case ExplanationType.EXPIRATION_PRIORITY:
      return 'Uses an ingredient expiring within three days';
    case ExplanationType.CONTEXT_COMPATIBILITY:
      return 'Highly rated option';
  }
}

function supportingReasonsFor(winner: RankedAlternative): string[] {
  return winner.strategyScores
    .filter(
      (result) =>
        result.type !== winner.explanationType &&
        result.score >= SUPPORTING_REASON_THRESHOLD,
    )
    .map((result) => reasonPhrase(result.type));
}
