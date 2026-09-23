import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/enums/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or controller) to users having one of the given roles.
 * Needs JwtAuthGuard and RolesGuard; `@Auth(...roles)` applies all three.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
