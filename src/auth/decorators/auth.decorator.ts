import { applyDecorators, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiErrorResponse } from '../../common/decorators/api-error-response.decorator';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { UserRole } from '../../users/enums/user-role.enum';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

/**
 * Protects a route or controller with an access token and, optionally, roles.
 *
 *   @Auth()                  any authenticated, active user
 *   @Auth(UserRole.ANALYST)  analysts only (others get 403 FORBIDDEN)
 *
 * Also documents bearer auth and the 401/403 responses in Swagger.
 */
export function Auth(...roles: UserRole[]) {
  const decorators = [
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiErrorResponse(
      HttpStatus.UNAUTHORIZED,
      '/api/v1/...',
      {
        code: ErrorCode.INVALID_ACCESS_TOKEN,
        message: 'The access token is missing or invalid',
      },
      {
        code: ErrorCode.USER_INACTIVE,
        message: 'This account is inactive',
      },
    ),
  ];
  if (roles.length) {
    decorators.push(
      Roles(...roles),
      ApiErrorResponse(HttpStatus.FORBIDDEN, '/api/v1/...', {
        code: ErrorCode.FORBIDDEN,
        message: 'You do not have permission to access this resource',
      }),
    );
  }
  return applyDecorators(...decorators);
}
