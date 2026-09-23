import { UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '../common/enums/error-code.enum';

// Single place for authentication failures, so wording and codes stay stable for the mobile clients.

/** Same response for an unknown email and a wrong password. */
export const invalidCredentials = () =>
  new UnauthorizedException({
    code: ErrorCode.INVALID_CREDENTIALS,
    message: 'Invalid email or password',
  });

export const userInactive = () =>
  new UnauthorizedException({
    code: ErrorCode.USER_INACTIVE,
    message: 'This account is inactive',
  });

export const invalidAccessToken = (expired = false) =>
  new UnauthorizedException({
    code: ErrorCode.INVALID_ACCESS_TOKEN,
    message: expired
      ? 'The access token has expired'
      : 'The access token is missing or invalid',
  });

export const invalidRefreshToken = () =>
  new UnauthorizedException({
    code: ErrorCode.INVALID_REFRESH_TOKEN,
    message: 'The refresh token is invalid, expired or already used',
  });

export const refreshSessionRevoked = () =>
  new UnauthorizedException({
    code: ErrorCode.REFRESH_SESSION_REVOKED,
    message: 'This session has ended; please log in again',
  });
