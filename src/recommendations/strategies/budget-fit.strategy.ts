import { ExplanationType } from '../enums/explanation-type.enum';
import {
  RecommendationCandidateInput,
  RecommendationScore,
  RecommendationStrategy,
} from './recommendation-strategy.interface';
import { clampScore } from './score-utils';

/** Rewards alternatives that cost less relative to the requested budget. */
export class BudgetFitStrategy implements RecommendationStrategy {
  readonly explanationType = ExplanationType.BUDGET_PRIORITY;

  calculate(input: RecommendationCandidateInput): RecommendationScore {
    if (input.maximumBudget <= 0) {
      return { value: input.estimatedCost === 0 ? 100 : 0 };
    }
    if (input.estimatedCost > input.maximumBudget) {
      return { value: 0 };
    }
    return {
      value: clampScore(100 * (1 - input.estimatedCost / input.maximumBudget)),
    };
  }
}
