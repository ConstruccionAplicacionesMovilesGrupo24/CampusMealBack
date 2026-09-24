/**
 * One open interval. `dayOfWeek` follows JS `Date#getDay()` (0 = Sunday ..
 * 6 = Saturday). A restaurant with a split lunch/dinner shift lists one
 * entry per interval; the same `dayOfWeek` may repeat.
 *
 * Computing OPEN / CLOSING_SOON / CLOSED from this schedule is issue #5
 * (BQ4) — this issue only stores it.
 */
export interface OpeningPeriod {
  dayOfWeek: number;
  /** 24-hour "HH:mm", local restaurant time (America/Bogota). */
  opensAt: string;
  closesAt: string;
}
