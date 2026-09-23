import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../password-policy';
import { NormalizeEmail } from './transforms';

export class LoginDto {
  @ApiProperty({
    example: 'demo@campusmeal.local',
    description: 'Trimmed and lowercased by the server.',
  })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    example: 'ExamplePassword123',
    format: 'password',
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
