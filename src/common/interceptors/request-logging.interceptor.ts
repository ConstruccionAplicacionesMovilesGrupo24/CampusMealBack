import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

/**
 * Logs one line per request: method, path (query string removed), final
 * status and duration. Headers, cookies, query values and bodies are never
 * logged, so tokens, passwords, API keys and coordinates stay out of the logs.
 * Avoid placing sensitive values (e.g. coordinates) in URL path segments.
 *
 * Registered as Express middleware (not a Nest interceptor) so it also sees
 * requests rejected by guards (401/403), unmatched routes and body-parser errors.
 */
export function requestLoggingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = performance.now();
  const path = request.originalUrl.split('?')[0];

  // 'finish' fires after the exception filter too, so the logged status is the real one.
  response.once('finish', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    const line = `${request.method} ${path} ${response.statusCode} ${durationMs}ms`;

    if (response.statusCode >= 500) {
      logger.error(line);
    } else if (response.statusCode >= 400) {
      logger.warn(line);
    } else {
      logger.log(line);
    }
  });

  next();
}
