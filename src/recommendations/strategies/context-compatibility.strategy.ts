import { ExplanationType } from '../enums/explanation-type.enum';
import {
  RecommendationCandidateInput,
  RecommendationScore,
  RecommendationStrategy,
} from './recommendation-strategy.interface';
import { clampScore } from './score-utils';

/**
 * Rewards general fit with the user's current context. Cooking your own inventory is
 * maximally compatible with the stated context by definition (restaurantRating is null only
 * for COOK); for WALK/ORDER, the chosen restaurant's average rating stands in for
 * contextual quality — the restaurant already passed the budget/dietary/opening-hours
 * filters, so rating is the remaining differentiator.
 */
export class ContextCompatibilityStrategy implements RecommendationStrategy {
  readonly explanationType = ExplanationType.CONTEXT_COMPATIBILITY;

  calculate(input: RecommendationCandidateInput): RecommendationScore {
    if (input.restaurantRating === null) {
      return { value: 100 };
    }
    return { value: clampScore((input.restaurantRating / 5) * 100) };
  }
}
