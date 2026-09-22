import { UserRole } from '../../users/enums/user-role.enum';

/** Access token claims (plus `iat`/`exp`). No names, emails or other personal data. */
export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  type: 'access';
}

/** Refresh token claims (plus `iat`/`exp` and a random `jti`). */
export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}
