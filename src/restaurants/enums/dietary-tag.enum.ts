/**
 * Stored in PostgreSQL as the `dietary_tag` enum type.
 * Exact values from the architecture doc §9 — mobile clients discard unknown values.
 */
export enum DietaryTag {
  VEGETARIAN = 'VEGETARIAN',
  VEGAN = 'VEGAN',
  GLUTEN_FREE = 'GLUTEN_FREE',
}
