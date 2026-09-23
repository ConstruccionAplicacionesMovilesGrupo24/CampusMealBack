import { HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

export interface ApiErrorExample {
  code: string;
  message: string;
}

/**
 * Documents an error status with one Swagger example per error code, all in
 * the common `{ statusCode, code, message, timestamp, path }` format.
 */
export function ApiErrorResponse(
  status: HttpStatus,
  path: string,
  ...errors: ApiErrorExample[]
): MethodDecorator & ClassDecorator {
  const examples = Object.fromEntries(
    errors.map(({ code, message }) => [
      code,
      {
        summary: code,
        value: {
          statusCode: status,
          code,
          message,
          timestamp: '2026-09-22T15:30:00.000Z',
          path,
        },
      },
    ]),
  );
  return ApiResponse({ status, type: ErrorResponseDto, examples });
}
