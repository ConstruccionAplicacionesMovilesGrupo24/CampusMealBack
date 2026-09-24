/**
 * Calendar-date helpers for inventory expiration (BQ2).
 *
 * Expiration dates are calendar dates ("2026-09-25"), not instants. `new Date('2026-09-25')`
 * is parsed as UTC midnight and would answer the wrong day for anyone west of UTC, so dates
 * here are kept as {year, month, day} and compared through `Date.UTC`, which makes the
 * subtraction a pure day count with no daylight-saving or offset arithmetic.
 */

export const INVENTORY_TIME_ZONE = 'America/Bogota';

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * The calendar date at `instant` in `timeZone`. `instant` is a parameter so the behaviour can
 * be checked with fixed instants (e.g. 2026-09-25T02:00:00Z is still 2026-09-24 in Bogotá).
 */
export function currentCalendarDate(
  instant: Date = new Date(),
  timeZone: string = INVENTORY_TIME_ZONE,
): CalendarDate {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value);

  return { year: part('year'), month: part('month'), day: part('day') };
}

/** Parses a strict `YYYY-MM-DD` calendar date, or null (rejects 2026-02-29, 2026-9-5, timestamps). */
export function parseCalendarDate(value: string): CalendarDate | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

export function isCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && parseCalendarDate(value) !== null;
}

export function formatCalendarDate(date: CalendarDate): string {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${date.year}-${month}-${day}`;
}

/** Whole calendar days from `from` to `to`: negative when `to` is in the past. */
export function calendarDaysBetween(
  from: CalendarDate,
  to: CalendarDate,
): number {
  // Date.UTC of a calendar date is always a whole number of UTC days, so this is exact.
  return utcDayNumber(to) - utcDayNumber(from);
}

/** `date` shifted by `days` calendar days (handles month, year and leap-year rollover). */
export function addCalendarDays(
  date: CalendarDate,
  days: number,
): CalendarDate {
  const shifted = new Date(utcMilliseconds(date) + days * MILLISECONDS_PER_DAY);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * remainingDays = expiration calendar day - today's Bogotá calendar day.
 * -1 expired yesterday, 0 expires today, 1 expires tomorrow.
 */
export function remainingDays(
  today: CalendarDate,
  expirationDate: string,
): number {
  const expiration = parseCalendarDate(expirationDate);
  if (!expiration) {
    throw new Error('Stored expiration date is not a calendar date');
  }
  return calendarDaysBetween(today, expiration);
}

function utcMilliseconds(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function utcDayNumber(date: CalendarDate): number {
  return utcMilliseconds(date) / MILLISECONDS_PER_DAY;
}

function daysInMonth(year: number, month: number): number {
  const leapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (month === 2) {
    return leapYear ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}
