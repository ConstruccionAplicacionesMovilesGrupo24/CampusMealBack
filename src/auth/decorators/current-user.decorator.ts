import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Injects the user resolved by JwtAuthGuard, or one of its fields:
 * `@CurrentUser() user: AuthenticatedUser` or `@CurrentUser('id') userId: string`.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser;
    return field ? user[field] : user;
  },
);
