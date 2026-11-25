/** Sprint 4 / BQ1 technical telemetry records. Stored as text with a CHECK constraint. */
export enum PerformanceEventType {
  SESSION_START = 'SESSION_START',
  FATAL_CRASH = 'FATAL_CRASH',
  COMPARISON_LOAD = 'COMPARISON_LOAD',
}
