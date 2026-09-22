import { ApiProperty } from '@nestjs/swagger';

/** Body of every error response, produced by HttpExceptionFilter. */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'VALIDATION_ERROR' })
  code: string;

  @ApiProperty({ example: 'email must be an email' })
  message: string;

  @ApiProperty({ example: '2026-09-22T15:30:00.000Z', format: 'date-time' })
  timestamp: string;

  @ApiProperty({ example: '/api/v1/example' })
  path: string;
}
