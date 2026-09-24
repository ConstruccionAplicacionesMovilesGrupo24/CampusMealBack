import { ExplanationType } from '../enums/explanation-type.enum';
import {
  RecommendationCandidateInput,
  RecommendationScore,
  RecommendationStrategy,
} from './recommendation-strategy.interface';
import { clampScore } from './score-utils';

/**
 * Rewards alternatives that use less of the available time. Candidates that don't fit at
 * all are normally excluded before scoring (RecommendationsService); scoring 0 here is only
 * a defensive floor, not the primary filter.
 */
export class TimeFitStrategy implements RecommendationStrategy {
  readonly explanationType = ExplanationType.TIME_PRIORITY;

  calculate(input: RecommendationCandidateInput): RecommendationScore {
    if (input.availableMinutes <= 0 || input.estimatedMinutes > input.availableMinutes) {
      return { value: 0 };
    }
    return {
      value: clampScore(100 * (1 - input.estimatedMinutes / input.availableMinutes)),
    };
  }
}
