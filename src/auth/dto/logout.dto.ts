import { RefreshTokenDto } from './refresh-token.dto';

/** Same body as refresh: `{ "refreshToken": "..." }` (matches Android's LogoutRequestDto). */
export class LogoutDto extends RefreshTokenDto {}
