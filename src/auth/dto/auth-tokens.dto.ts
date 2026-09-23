import { ApiProperty } from '@nestjs/swagger';

/** Returned by register, login and refresh (matches Android's TokenResponseDto). */
export class AuthTokensDto {
  @ApiProperty({
    example: 'example-access-token',
    description:
      'Short-lived JWT. Send it as `Authorization: Bearer <accessToken>`.',
  })
  accessToken: string;

  @ApiProperty({
    example: 'example-refresh-token',
    description:
      'Long-lived JWT for POST /auth/refresh and POST /auth/logout. Single use: every refresh returns a new one.',
  })
  refreshToken: string;
}
