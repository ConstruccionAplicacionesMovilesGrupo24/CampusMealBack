import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_DESCRIPTION,
  PASSWORD_RULES,
} from '../password-policy';
import { NormalizeEmail, Trim } from './transforms';

const { uppercase, lowercase, number } = PASSWORD_RULES;

// Field names match the Android client's RegisterRequestDto(fullName, email, password).
export class RegisterDto {
  @ApiProperty({
    example: 'CampusMeal Demo',
    maxLength: 100,
    description: 'Trimmed by the server; must not be blank.',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @ApiProperty({
    example: 'demo@campusmeal.local',
    maxLength: 254,
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
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: PASSWORD_POLICY_DESCRIPTION,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(uppercase.pattern, { message: uppercase.message })
  @Matches(lowercase.pattern, { message: lowercase.message })
  @Matches(number.pattern, { message: number.message })
  password: string;
}
