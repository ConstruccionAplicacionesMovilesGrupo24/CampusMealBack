/**
 * Coarse budget bands (COP) used as optional demand context for BQ9.
 * LOW <= 15000 < MEDIUM <= 25000 < HIGH. Stored as the `usage_budget_band` enum type.
 */
export enum BudgetBand {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}
