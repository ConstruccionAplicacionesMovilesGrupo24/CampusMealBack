import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthConfiguration, Configuration } from '../config/configuration';
import { RefreshSession } from '../users/entities/refresh-session.entity';
import { User } from '../users/entities/user.entity';
import { emailAlreadyRegistered, UsersService } from '../users/users.service';
import {
  invalidCredentials,
  invalidRefreshToken,
  refreshSessionRevoked,
  userInactive,
} from './auth-errors';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
} from './interfaces/jwt-payload.interface';
import { PasswordService } from './password.service';

interface UsableSession {
  session: RefreshSession;
  /** Hash of the refresh token that was presented. */
  tokenHash: string;
}

/**
 * Registration, login and refresh-session lifecycle.
 *
 * Each login creates a refresh session. The session stores only an HMAC of its
 * current refresh token. A refresh swaps that hash with one atomic
 * compare-and-swap (`UPDATE ... WHERE token_hash = <presented hash>`), so
 * exactly one request can rotate a given token. Any other request presenting
 * that (now superseded) token gets 401 and leaves the session untouched, so
 * the winner's new token keeps working. Only logout revokes a session.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly config: AuthConfiguration;
  private readonly refreshHashKey: Buffer;

  constructor(
    config: ConfigService<Configuration, true>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    @InjectRepository(RefreshSession)
    private readonly sessions: Repository<RefreshSession>,
  ) {
    this.config = config.get('auth', { infer: true });
    // Dedicated key for token hashing, derived from (not equal to) the refresh signing secret.
    this.refreshHashKey = Buffer.from(
      hkdfSync(
        'sha256',
        this.config.refreshSecret,
        '',
        'campusmeal:refresh-token-hash',
        32,
      ),
    );
  }

  async register(dto: RegisterDto): Promise<AuthTokensDto> {
    // Cheap pre-check avoids hashing for obvious duplicates; the unique constraint covers races.
    if (await this.usersService.findByEmail(dto.email)) {
      throw emailAlreadyRegistered();
    }
    const passwordHash = await this.passwordService.hash(dto.password);

    return this.dataSource.transaction(async (manager) => {
      const user = await this.usersService.create(
        { name: dto.fullName, email: dto.email, passwordHash },
        manager,
      );
      return this.startSession(user, manager);
    });
  }

  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.usersService.findByEmailWithPasswordHash(dto.email);
    const passwordMatches = user
      ? await this.passwordService.verify(user.passwordHash, dto.password)
      : await this.passwordService.verifyAgainstDummy(dto.password);

    if (!user || !passwordMatches) {
      throw invalidCredentials();
    }
    if (!user.active) {
      throw userInactive();
    }
    return this.startSession(user, this.dataSource.manager);
  }

  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const { session, tokenHash } = await this.findUsableSession(refreshToken);

    const user = await this.usersService.findById(session.userId);
    if (!user) {
      throw invalidRefreshToken();
    }
    if (!user.active) {
      throw userInactive();
    }

    const tokens = await this.issueTokens(user, session.id);
    const rotated = await this.sessions
      .createQueryBuilder()
      .update(RefreshSession)
      .set({
        tokenHash: this.hashRefreshToken(tokens.refreshToken),
        expiresAt: this.refreshExpiry(),
      })
      .where(
        'id = :id AND user_id = :userId AND token_hash = :tokenHash AND revoked_at IS NULL AND expires_at > now()',
        { id: session.id, userId: session.userId, tokenHash },
      )
      .execute();

    if (rotated.affected !== 1) {
      // A concurrent request rotated (or logged out) this token first. Reject this
      // request only: revoking here would invalidate the winner's new token.
      this.logSupersededToken(session);
      throw invalidRefreshToken();
    }
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const { session, tokenHash } = await this.findUsableSession(refreshToken);

    const revoked = await this.sessions
      .createQueryBuilder()
      .update(RefreshSession)
      .set({ revokedAt: () => 'now()' })
      .where(
        'id = :id AND user_id = :userId AND token_hash = :tokenHash AND revoked_at IS NULL',
        { id: session.id, userId: session.userId, tokenHash },
      )
      .execute();

    if (revoked.affected !== 1) {
      // The token was rotated or the session logged out concurrently.
      throw invalidRefreshToken();
    }
  }

  private async startSession(
    user: User,
    manager: EntityManager,
  ): Promise<AuthTokensDto> {
    const sessionId = randomUUID();
    const tokens = await this.issueTokens(user, sessionId);

    await manager.getRepository(RefreshSession).insert({
      id: sessionId,
      userId: user.id,
      tokenHash: this.hashRefreshToken(tokens.refreshToken),
      expiresAt: this.refreshExpiry(),
      revokedAt: null,
    });
    return tokens;
  }

  private async issueTokens(
    user: User,
    sessionId: string,
  ): Promise<AuthTokensDto> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      sid: sessionId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.config.accessSecret,
        expiresIn: this.config.accessTtlSeconds,
        algorithm: 'HS256',
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.config.refreshSecret,
        expiresIn: this.config.refreshTtlSeconds,
        algorithm: 'HS256',
        // Makes every refresh token unique, even two issued in the same second.
        jwtid: randomUUID(),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  /**
   * Validates signature, expiration and type, then loads the session only if it
   * belongs to the token's subject, is active, and the token is its current one.
   */
  private async findUsableSession(
    refreshToken: string,
  ): Promise<UsableSession> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const session = await this.sessions
      .createQueryBuilder('session')
      .addSelect('session.tokenHash')
      .where('session.id = :id AND session.userId = :userId', {
        id: payload.sid,
        userId: payload.sub,
      })
      .getOne();

    // A missing session and one owned by another user look the same to the caller.
    if (!session) {
      throw invalidRefreshToken();
    }
    if (session.revokedAt) {
      throw refreshSessionRevoked();
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw invalidRefreshToken();
    }

    // Early rejection of a superseded token. The atomic UPDATE in refresh/logout
    // remains the real guard; this check never modifies the session.
    const tokenHash = this.hashRefreshToken(refreshToken);
    if (!this.hashesMatch(tokenHash, session.tokenHash)) {
      this.logSupersededToken(session);
      throw invalidRefreshToken();
    }
    return { session, tokenHash };
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenPayload> {
    let payload: Partial<RefreshTokenPayload>;
    try {
      payload = await this.jwtService.verifyAsync<Partial<RefreshTokenPayload>>(
        refreshToken,
        {
          secret: this.config.refreshSecret,
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw invalidRefreshToken();
    }

    if (
      payload.type !== 'refresh' ||
      !isUUID(payload.sub) ||
      !isUUID(payload.sid)
    ) {
      throw invalidRefreshToken();
    }
    return payload as RefreshTokenPayload;
  }

  /**
   * A superseded token is expected after a lost concurrent refresh, but can also
   * indicate a replayed (stolen) token. Only IDs are logged, never tokens or hashes.
   * Full token-family revocation is intentionally out of the prototype's scope.
   */
  private logSupersededToken(session: RefreshSession): void {
    this.logger.warn(
      `Rejected superseded refresh token for session ${session.id} of user ${session.userId}`,
    );
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHmac('sha256', this.refreshHashKey)
      .update(refreshToken)
      .digest('hex');
  }

  private hashesMatch(a: string, b: string): boolean {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.config.refreshTtlSeconds * 1000);
  }
}
