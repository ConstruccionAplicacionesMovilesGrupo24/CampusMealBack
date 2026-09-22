import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ErrorCode } from '../enums/error-code.enum';

// class-validator messages start with the property name ("email must be an email").
// Nested properties are prefixed with their parent path ("address.city must be a string").
function collectMessages(errors: ValidationError[], parentPath = ''): string[] {
  return errors.flatMap((error) => {
    const prefix = parentPath ? `${parentPath}.` : '';
    const own = Object.values(error.constraints ?? {}).map(
      (message) => `${prefix}${message}`,
    );
    const nested = collectMessages(
      error.children ?? [],
      `${prefix}${error.property}`,
    );
    return [...own, ...nested];
  });
}

/** Used by the global ValidationPipe to produce a readable VALIDATION_ERROR. */
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const messages = collectMessages(errors);
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: messages.length ? messages.join('; ') : 'The request is invalid',
  });
}
