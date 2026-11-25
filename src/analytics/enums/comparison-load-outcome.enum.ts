/** How one explicit meal-comparison load ended. Only FRESH_NETWORK enters the BQ1 p95. */
export enum ComparisonLoadOutcome {
  /** The backend answered and that content was rendered. */
  FRESH_NETWORK = 'FRESH_NETWORK',
  /** A recent current recommendation was restored on the device, without a request. */
  CACHED_RESTORE = 'CACHED_RESTORE',
  /** The backend was unreachable and a previous comparison was shown as history. */
  OFFLINE_HISTORY = 'OFFLINE_HISTORY',
  ERROR = 'ERROR',
  TIMEOUT = 'TIMEOUT',
  /** The user left or asked for another comparison first. */
  CANCELLED = 'CANCELLED',
}

/** Outcomes that ended with content on screen: they must carry a duration. */
export const OUTCOMES_WITH_CONTENT: readonly ComparisonLoadOutcome[] = [
  ComparisonLoadOutcome.FRESH_NETWORK,
  ComparisonLoadOutcome.CACHED_RESTORE,
  ComparisonLoadOutcome.OFFLINE_HISTORY,
];
