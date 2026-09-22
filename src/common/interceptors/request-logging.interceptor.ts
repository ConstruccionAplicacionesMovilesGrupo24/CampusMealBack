import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';

/**
 * Logs one line per request: method, path (query string removed), final
 * status and duration. Headers, cookies, query values and bodies are never
 * logged, so tokens, passwords, API keys and coordinates stay out of the logs.
 * Avoid placing sensitive values (e.g. coordinates) in URL path segments.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = performance.now();
    const path = request.originalUrl.split('?')[0];

    // 'finish' fires after the exception filter too, so the logged status is the real one.
    response.once('finish', () => {
      const durationMs = Math.round(performance.now() - startedAt);
      const line = `${request.method} ${path} ${response.statusCode} ${durationMs}ms`;

      if (response.statusCode >= 500) {
        this.logger.error(line);
      } else if (response.statusCode >= 400) {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    });

    return next.handle();
  }
}
