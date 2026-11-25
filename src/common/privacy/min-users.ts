/**
 * Minimum number of distinct users behind any published behavioral or review aggregate
 * (same rule as BQ9). Below it every value of the cell is withheld.
 */
export const MIN_DISTINCT_USERS = 5;

/**
 * - 0 users: nothing to protect, the cell is a real zero (not suppressed).
 * - 1-4 users: suppressed, values are null.
 * - 5 or more: published.
 */
export function isSuppressed(distinctUsers: number): boolean {
  return distinctUsers > 0 && distinctUsers < MIN_DISTINCT_USERS;
}

export function round(value: number | null, decimals = 2): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
