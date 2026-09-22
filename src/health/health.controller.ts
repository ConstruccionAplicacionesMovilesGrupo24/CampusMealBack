import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { HealthResponseDto } from './health-response.dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check that the API and PostgreSQL are reachable' })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    example: {
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database is unavailable',
      timestamp: '2026-09-22T15:30:00.000Z',
      path: '/api/v1/health',
    },
  })
  check(): Promise<HealthResponseDto> {
    return this.healthService.check();
  }
}
