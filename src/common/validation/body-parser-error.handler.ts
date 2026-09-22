import { HttpException, HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ErrorCode, errorCodeForStatus } from '../enums/error-code.enum';

/** Errors raised by Express' body parser (malformed JSON, oversized body, ...). */
interface BodyParserError {
  status: number;
  type: string;
}

const KNOWN_ERRORS: Record<
  string,
  { status: number; code: ErrorCode; message: string }
> = {
  'entity.parse.failed': {
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.INVALID_JSON,
    message: 'The request body is not valid JSON',
  },
  'entity.too.large': {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    code: ErrorCode.PAYLOAD_TOO_LARGE,
    message: 'The request body is too large',
  },
};

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as BodyParserError).status === 'number' &&
    typeof (error as BodyParserError).type === 'string'
  );
}

/**
 * Express error middleware registered right after the JSON body parser.
 * The parser's own messages can quote fragments of the body (e.g. a password),
 * so they are replaced by fixed messages before reaching HttpExceptionFilter.
 */
export function bodyParserErrorHandler(
  error: unknown,
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (!isBodyParserError(error)) {
    next(error);
    return;
  }

  const known = KNOWN_ERRORS[error.type] ?? {
    status: error.status,
    code: errorCodeForStatus(error.status),
    message: 'The request body could not be processed',
  };
  next(
    new HttpException(
      { code: known.code, message: known.message },
      known.status,
    ),
  );
}
