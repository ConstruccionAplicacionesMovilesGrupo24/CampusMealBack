import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponse } from '../common/decorators/api-error-response.decorator';
import { ErrorCode } from '../common/enums/error-code.enum';
import { AuthService } from './auth.service';
import { Auth } from './decorators/auth.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { CurrentUserDto } from './dto/current-user.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { PASSWORD_POLICY_DESCRIPTION } from './password-policy';

const validationError = (path: string, message: string) =>
  ApiErrorResponse(HttpStatus.BAD_REQUEST, path, {
    code: ErrorCode.VALIDATION_ERROR,
    message,
  });

const invalidRefreshTokenErrors = (path: string) =>
  ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    path,
    {
      code: ErrorCode.INVALID_REFRESH_TOKEN,
      message: 'The refresh token is invalid, expired or already used',
    },
    {
      code: ErrorCode.REFRESH_SESSION_REVOKED,
      message: 'This session has ended; please log in again',
    },
    { code: ErrorCode.USER_INACTIVE, message: 'This account is inactive' },
  );

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Create an account and start a session',
    description: `Creates a USER account and returns the same tokens as login. The email is trimmed and lowercased. Password: ${PASSWORD_POLICY_DESCRIPTION}`,
  })
  @ApiCreatedResponse({ type: AuthTokensDto })
  @validationError(
    '/api/v1/auth/register',
    'password must contain at least one uppercase letter',
  )
  @ApiErrorResponse(HttpStatus.CONFLICT, '/api/v1/auth/register', {
    code: ErrorCode.EMAIL_ALREADY_REGISTERED,
    message: 'An account with this email already exists',
  })
  register(@Body() dto: RegisterDto): Promise<AuthTokensDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'Starts a new session. An unknown email and a wrong password produce the same 401 response.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  @validationError('/api/v1/auth/login', 'email must be an email')
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    '/api/v1/auth/login',
    {
      code: ErrorCode.INVALID_CREDENTIALS,
      message: 'Invalid email or password',
    },
    { code: ErrorCode.USER_INACTIVE, message: 'This account is inactive' },
  )
  login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for new tokens (rotation)',
    description:
      'Returns a new access token and a new refresh token. The submitted refresh token stops working immediately. ' +
      'If several requests submit the same token concurrently, exactly one succeeds; the others receive 401 INVALID_REFRESH_TOKEN ' +
      'and the winner keeps a valid session. Clients should still send one refresh at a time per session (single-flight) and ' +
      'let waiting requests reuse the new tokens.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  @validationError('/api/v1/auth/refresh', 'refreshToken should not be empty')
  @invalidRefreshTokenErrors('/api/v1/auth/refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'End the session of a refresh token',
    description:
      'Revokes the session. No access token is required, so logout also works after the access token expired. ' +
      'Returns 204 with an empty body. An invalid, expired or already revoked refresh token returns 401; clients should clear local tokens either way.',
  })
  @ApiNoContentResponse({ description: 'Session revoked. Empty body.' })
  @validationError('/api/v1/auth/logout', 'refreshToken should not be empty')
  @invalidRefreshTokenErrors('/api/v1/auth/logout')
  logout(@Body() dto: LogoutDto): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  @Auth()
  @ApiOperation({ summary: 'Get the authenticated user' })
  @ApiOkResponse({ type: CurrentUserDto })
  me(@CurrentUser() user: AuthenticatedUser): CurrentUserDto {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
