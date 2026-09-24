/**
 * Which of the four strategies dominated the winning alternative's score. Stored on
 * RecommendationRun (nullable — a run with zero available alternatives has no dominant
 * strategy) so issue #7 (BQ8) can group impressions/selections by explanation category
 * without re-deriving it from the alternatives.
 */
export enum ExplanationType {
  TIME_PRIORITY = 'TIME_PRIORITY',
  BUDGET_PRIORITY = 'BUDGET_PRIORITY',
  EXPIRATION_PRIORITY = 'EXPIRATION_PRIORITY',
  CONTEXT_COMPATIBILITY = 'CONTEXT_COMPATIBILITY',
}
