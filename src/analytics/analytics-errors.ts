import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../common/enums/error-code.enum';

/**
 * Same response for an unknown recommendation and another user's recommendation, so a
 * caller cannot learn whether a UUID belongs to somebody else.
 */
export const recommendationNotFound = () =>
  new NotFoundException({
    code: ErrorCode.RECOMMENDATION_NOT_FOUND,
    message: 'Recommendation not found',
  });

export const invalidDateRange = () =>
  new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'from must be on or before to',
  });

export const featureNotAllowedForSession = () =>
  new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'feature must be null or omitted for SESSION_STARTED',
  });

export const occurredAtOutOfRange = (maxAgeDays: number) =>
  new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: `occurredAt must not be in the future nor older than ${maxAgeDays} days`,
  });
