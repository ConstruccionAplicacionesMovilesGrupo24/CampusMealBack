import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { isUUID } from 'class-validator';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Configuration } from '../../config/configuration';
import { UsersService } from '../../users/users.service';
import { invalidAccessToken, userInactive } from '../auth-errors';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { AccessTokenPayload } from '../interfaces/jwt-payload.interface';

export const JWT_ACCESS_STRATEGY = 'jwt-access';

/**
 * Verifies the bearer access token (HS256 signature with JWT_ACCESS_SECRET and
 * expiration), then loads the user so role changes and deactivation apply
 * immediately. Refresh tokens fail here: different secret and `type`.
 */
@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  JWT_ACCESS_STRATEGY,
) {
  constructor(
    config: ConfigService<Configuration, true>,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('auth', { infer: true }).accessSecret,
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  async validate(
    payload: Partial<AccessTokenPayload>,
  ): Promise<AuthenticatedUser> {
    // A malformed `sub` would otherwise reach PostgreSQL's uuid cast and fail with a 500.
    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      !isUUID(payload.sub)
    ) {
      throw invalidAccessToken();
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw invalidAccessToken();
    }
    if (!user.active) {
      throw userInactive();
    }

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
