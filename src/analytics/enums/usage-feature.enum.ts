/**
 * Core CampusMeal features measured by BQ6. One FEATURE_USED event is one explicit user
 * interaction; recompositions and retries never count.
 * Stored in PostgreSQL as the `usage_feature` enum type.
 */
export enum UsageFeature {
  INVENTORY = 'INVENTORY',
  RECIPES = 'RECIPES',
  RESTAURANT_SEARCH = 'RESTAURANT_SEARCH',
  RESTAURANT_DETAIL = 'RESTAURANT_DETAIL',
  MEAL_COMPARISON = 'MEAL_COMPARISON',
}
