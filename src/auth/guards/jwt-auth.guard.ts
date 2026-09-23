import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { invalidAccessToken } from '../auth-errors';
import { JWT_ACCESS_STRATEGY } from '../strategies/jwt-access.strategy';

/**
 * Requires a valid access token (`Authorization: Bearer <accessToken>`) and
 * puts the active user in `request.user`. Reuse it in any module.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_ACCESS_STRATEGY) {
  handleRequest<TUser>(
    error: unknown,
    user: TUser | false,
    info: unknown,
  ): TUser {
    if (error) {
      // Errors raised by JwtAccessStrategy.validate already carry a stable code;
      // unexpected ones (e.g. database down) still surface through the global filter.
      throw error instanceof Error ? error : invalidAccessToken();
    }
    if (!user) {
      const expired =
        info instanceof Error && info.name === 'TokenExpiredError';
      throw invalidAccessToken(expired);
    }
    return user;
  }
}
