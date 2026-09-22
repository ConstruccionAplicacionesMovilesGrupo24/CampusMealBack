import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'example-refresh-token',
    writeOnly: true,
    description: 'The most recent refresh token issued for the session.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken: string;
}
