import { UserRole } from '../../users/enums/user-role.enum';

/** What JwtAuthGuard places in `request.user`. Contains no secrets. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
