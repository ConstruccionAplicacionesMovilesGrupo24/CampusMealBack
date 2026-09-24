import { ExplanationType } from '../enums/explanation-type.enum';
import {
  RecommendationCandidateInput,
  RecommendationScore,
  RecommendationStrategy,
} from './recommendation-strategy.interface';
import { clampScore } from './score-utils';

// Each expiring ingredient (remainingDays 0-3) this alternative uses contributes this many
// points; 4 or more ingredients already reach the 100 cap. Only COOK candidates have any
// (WALK/ORDER always pass expiringIngredientCount = 0 and score 0 here).
const POINTS_PER_EXPIRING_INGREDIENT = 25;

/** Rewards alternatives that use ingredients expiring within three days (the smart feature's core signal). */
export class ExpirationPriorityStrategy implements RecommendationStrategy {
  readonly explanationType = ExplanationType.EXPIRATION_PRIORITY;

  calculate(input: RecommendationCandidateInput): RecommendationScore {
    return {
      value: clampScore(input.expiringIngredientCount * POINTS_PER_EXPIRING_INGREDIENT),
    };
  }
}
