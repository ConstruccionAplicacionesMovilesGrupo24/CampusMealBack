import { Transform } from 'class-transformer';

/**
 * Query strings arrive as text. Maps exactly "true"/"false" to booleans and leaves anything else
 * untouched, so `@IsBoolean()` rejects values such as "yes" or "1" instead of guessing.
 */
export const QueryBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });
