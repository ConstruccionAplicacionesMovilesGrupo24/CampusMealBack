import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { isCalendarDate } from '../inventory-date';

/**
 * Accepts only a real calendar date in exact `YYYY-MM-DD` form. Rejects impossible dates
 * (2026-02-29, 2026-04-31), loose forms (2026-9-5) and timestamps (2026-09-25T00:00:00Z).
 */
export function IsCalendarDate(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => isCalendarDate(value),
        defaultMessage: (args?: ValidationArguments) =>
          `${args?.property ?? 'value'} must be a real calendar date in YYYY-MM-DD format`,
      },
    });
  };
}
