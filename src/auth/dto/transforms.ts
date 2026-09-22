import { Transform } from 'class-transformer';
import { normalizeEmail } from '../../users/normalize-email';

/** Trims string input; non-strings are left for the validators to reject. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Trims and lowercases string input before validation. */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );
