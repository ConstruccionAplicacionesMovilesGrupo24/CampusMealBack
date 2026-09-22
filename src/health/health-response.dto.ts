import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok', enum: ['ok'] })
  status: 'ok';

  @ApiProperty({ example: 'up', enum: ['up'] })
  database: 'up';

  @ApiProperty({ example: '2026-09-22T15:30:00.000Z', format: 'date-time' })
  timestamp: string;
}
