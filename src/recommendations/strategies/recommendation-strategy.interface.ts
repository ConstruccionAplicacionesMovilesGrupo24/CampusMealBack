import { ExplanationType } from '../enums/explanation-type.enum';
import { MealAlternative } from '../enums/meal-alternative.enum';

/** One alternative's raw attributes, computed by RecommendationsService before scoring. */
export interface RecommendationCandidateInput {
  type: MealAlternative;
  estimatedMinutes: number;
  estimatedCost: number;
  availableMinutes: number;
  maximumBudget: number;
  expiringIngredientCount: number;
  restaurantRating: number | null;
}

export interface RecommendationScore {
  /** 0-100. */
  value: number;
}

/**
 * The Strategy pattern required by issue #6: each strategy scores a candidate on exactly
 * one dimension. RecommendationsService averages the four scores for the overall ranking,
 * and reports whichever strategy scored highest as the candidate's `explanationType`.
 */
export interface RecommendationStrategy {
  readonly explanationType: ExplanationType;
  calculate(input: RecommendationCandidateInput): RecommendationScore;
}
