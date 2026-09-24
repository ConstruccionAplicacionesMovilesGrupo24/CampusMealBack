import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../auth/dto/transforms';
import { IsCalendarDate } from './is-calendar-date.validator';

export class CreateInventoryItemDto {
  @ApiProperty({ example: 'Whole milk', maxLength: 150 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({
    example: 1.0,
    minimum: 0,
    description: 'Finite, non-negative amount in `unit`.',
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  quantity: number;

  @ApiProperty({ example: 'L', maxLength: 30 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  unit: string;

  @ApiProperty({
    example: '2026-09-25',
    description:
      'Calendar date `YYYY-MM-DD` (America/Bogota). Past dates are allowed: an item may already be expired.',
  })
  @IsCalendarDate()
  expirationDate: string;
}
