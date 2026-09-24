import { OpeningPeriod } from './opening-period';

export enum OpeningStatus {
  OPEN = 'OPEN',
  CLOSING_SOON = 'CLOSING_SOON',
  CLOSED = 'CLOSED',
}

export const RESTAURANT_TIME_ZONE = 'America/Bogota';
export const CLOSING_SOON_MINUTES = 30;

interface LocalClock {
  dayOfWeek: number;
  minuteOfDay: number;
}

export function evaluateOpeningStatus(
  openingHours: OpeningPeriod[],
  instant: Date,
): OpeningStatus {
  const clock = localClock(instant);
  let shortestMinutesUntilClose: number | null = null;

  for (const period of openingHours) {
    const opensAt = parseClock(period.opensAt);
    const closesAt = parseClock(period.closesAt);
    const minutesUntilClose = activeMinutesUntilClose(
      period.dayOfWeek,
      opensAt,
      closesAt,
      clock,
    );

    if (minutesUntilClose !== null) {
      shortestMinutesUntilClose =
        shortestMinutesUntilClose === null
          ? minutesUntilClose
          : Math.min(shortestMinutesUntilClose, minutesUntilClose);
    }
  }

  if (shortestMinutesUntilClose === null) {
    return OpeningStatus.CLOSED;
  }

  return shortestMinutesUntilClose <= CLOSING_SOON_MINUTES
    ? OpeningStatus.CLOSING_SOON
    : OpeningStatus.OPEN;
}

function activeMinutesUntilClose(
  periodDay: number,
  opensAt: number,
  closesAt: number,
  clock: LocalClock,
): number | null {
  if (opensAt < closesAt) {
    if (
      clock.dayOfWeek === periodDay &&
      clock.minuteOfDay >= opensAt &&
      clock.minuteOfDay < closesAt
    ) {
      return closesAt - clock.minuteOfDay;
    }
    return null;
  }

  // Overnight interval, e.g. 18:00 -> 02:00.
  if (opensAt > closesAt) {
    if (clock.dayOfWeek === periodDay && clock.minuteOfDay >= opensAt) {
      return 1440 - clock.minuteOfDay + closesAt;
    }

    const followingDay = (periodDay + 1) % 7;
    if (clock.dayOfWeek === followingDay && clock.minuteOfDay < closesAt) {
      return closesAt - clock.minuteOfDay;
    }
  }

  return null;
}

function parseClock(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return -1;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return -1;
  }
  return hour * 60 + minute;
}

function localClock(instant: Date): LocalClock {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const values = new Map(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );

  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');
  const hour = values.get('hour');
  const minute = values.get('minute');

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new Error(
      'Could not convert requestedAt to the restaurant time zone',
    );
  }

  return {
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    minuteOfDay: hour * 60 + minute,
  };
}
