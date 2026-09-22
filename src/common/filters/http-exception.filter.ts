import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorResponseDto } from '../dto/error-response.dto';
import { ErrorCode, errorCodeForStatus } from '../enums/error-code.enum';

interface ErrorDescription {
  statusCode: number;
  code: string;
  message: string;
}

/**
 * Converts every exception into the common error format:
 * { statusCode, code, message, timestamp, path }.
 * Stack traces, request bodies and query strings are never returned.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    if (response.headersSent) {
      return;
    }

    const { statusCode, code, message } = this.describe(exception);
    const body: ErrorResponseDto = {
      statusCode,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.originalUrl.split('?')[0],
    };

    response.status(statusCode).json(body);
  }

  private describe(exception: unknown): ErrorDescription {
    if (exception instanceof HttpException) {
      return this.describeHttpException(exception);
    }

    // Unexpected error: log it server-side, return a generic message to the client.
    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    };
  }

  private describeHttpException(exception: HttpException): ErrorDescription {
    const statusCode = exception.getStatus();
    const payload = exception.getResponse();
    let code: string = errorCodeForStatus(statusCode);
    let message = exception.message;

    if (typeof payload === 'string') {
      message = payload;
    } else if (typeof payload === 'object' && payload !== null) {
      const { code: customCode, message: customMessage } = payload as {
        code?: unknown;
        message?: unknown;
      };
      if (typeof customCode === 'string') {
        code = customCode;
      }
      if (typeof customMessage === 'string') {
        message = customMessage;
      } else if (Array.isArray(customMessage)) {
        message = customMessage.join('; ');
      }
    }

    // Nest's "Cannot GET /path?query" would echo the full URL, including query values.
    if (
      exception instanceof NotFoundException &&
      /^Cannot [A-Z]+ /.test(message)
    ) {
      message = 'Route not found';
    }

    return { statusCode, code, message };
  }
}
