import { ExplanationType } from './enums/explanation-type.enum';
import { MealAlternative } from './enums/meal-alternative.enum';

export interface ExpiringIngredientSummary {
  itemId: string;
  name: string;
  remainingDays: number;
}

export interface AlternativeRestaurantSummary {
  id: string;
  name: string;
  walkingMinutes: number | null;
  deliveryMinutes: number | null;
  deliveryFee: number | null;
}

/** One alternative before scoring. */
export interface Candidate {
  type: MealAlternative;
  estimatedMinutes: number;
  estimatedCost: number;
  /** Active inventory items (remainingDays 0-3) this alternative uses. COOK only. */
  expiringIngredientCount: number;
  /** 0-5, only meaningful for WALK/ORDER (the chosen restaurant's averageRating). */
  restaurantRating: number | null;
  expiringIngredients: ExpiringIngredientSummary[] | null;
  restaurant: AlternativeRestaurantSummary | null;
}

export interface StrategyScore {
  type: ExplanationType;
  score: number;
}

export interface ScoredCandidate extends Candidate {
  /** Average of the four strategy scores, 0-100. */
  score: number;
  /** The single highest-scoring strategy for this candidate. */
  explanationType: ExplanationType;
  strategyScores: StrategyScore[];
}

export interface RankedAlternative extends ScoredCandidate {
  rank: number;
  recommended: boolean;
  metadata: Record<string, unknown> | null;
}
