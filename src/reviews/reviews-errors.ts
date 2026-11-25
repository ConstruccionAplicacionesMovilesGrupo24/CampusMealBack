import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '../common/enums/error-code.enum';

export const restaurantNotFound = () =>
  new NotFoundException({
    code: ErrorCode.RESTAURANT_NOT_FOUND,
    message: 'Restaurant not found',
  });

/** A different clientReviewId for the same author, restaurant and Bogotá day. */
export const reviewAlreadySubmittedToday = () =>
  new ConflictException({
    code: ErrorCode.REVIEW_ALREADY_SUBMITTED_TODAY,
    message:
      'You already reviewed this restaurant on this day (America/Bogota)',
  });

/** The same clientReviewId was already used by this author with different content. */
export const clientReviewIdConflict = () =>
  new ConflictException({
    code: ErrorCode.CLIENT_REVIEW_ID_CONFLICT,
    message:
      'clientReviewId was already used for a different review; generate a new id',
  });

export const reviewOccurredAtOutOfRange = (maxAgeDays: number) =>
  new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: `occurredAt must not be in the future nor older than ${maxAgeDays} days`,
  });
