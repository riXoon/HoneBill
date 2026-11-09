import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiResponseException } from '../exceptions/api-response.exception.js';
import { API_BASE_PATH } from '../api-prefix';

const BAD_JSON_BODIES: Record<string, unknown> = {
  [`${API_BASE_PATH}/auth`]: {
    error: 'Bad Request',
    message: "Request body must contain a valid 'transaction' field.",
  },
  [`${API_BASE_PATH}/auth/pin/verify`]: { error: 'A valid phone number and PIN are required.' },
  [`${API_BASE_PATH}/register`]: { error: 'Invalid JSON body' },
};

@Catch()
/** Converts Nest and parser exceptions into the API's established JSON error contracts. */
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  /** Maps route-specific, throttling, Nest, and unexpected errors to the API JSON contract. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    if (isEntityParseFailed(exception)) {
      const path = request.originalUrl.split('?')[0].replace(/\/+$/, '');
      const body = BAD_JSON_BODIES[path];
      if (body) {
        response.status(HttpStatus.BAD_REQUEST).json(body);
        return;
      }
    }

    if (
      request.method === 'POST' &&
      request.path === `${API_BASE_PATH}/register` &&
      exception instanceof HttpException &&
      exception.getStatus() === HttpStatus.BAD_REQUEST &&
      isJsonParserMessage(exception.message)
    ) {
      response.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid JSON body' });
      return;
    }

    if (isThrottlerException(exception)) {
      response.status(HttpStatus.TOO_MANY_REQUESTS).json({
        error: 'Too many requests. Please try again later.',
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (
        'retryAfterSeconds' in exception &&
        typeof exception.retryAfterSeconds === 'number'
      ) {
        response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      } else if (
        status === 423 &&
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'retryAfter' in exceptionResponse &&
        typeof exceptionResponse.retryAfter === 'number'
      ) {
        response.setHeader('Retry-After', String(exceptionResponse.retryAfter));
      }

      if (exception instanceof ApiResponseException) {
        response.status(status).json(exception.responseBody);
        return;
      }

      if (typeof exceptionResponse === 'string') {
        response.status(status).json({ error: exceptionResponse });
        return;
      }

      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'found' in exceptionResponse &&
        exceptionResponse.found === false
      ) {
        response.status(status).json({ found: false });
        return;
      }

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const exceptionBody = exceptionResponse as Record<string, unknown>;
        const error =
          typeof exceptionBody.message === 'string'
            ? exceptionBody.message
            : typeof exceptionBody.error === 'string'
              ? exceptionBody.error
              : exception.message;
        const contractBody: Record<string, unknown> = { error };
        if (typeof exceptionBody.attemptsRemaining === 'number') {
          contractBody.attemptsRemaining = exceptionBody.attemptsRemaining;
        }
        if (typeof exceptionBody.retryAfter === 'number') {
          contractBody.retryAfter = exceptionBody.retryAfter;
        }
        if (typeof exceptionBody.code === 'string') {
          contractBody.code = exceptionBody.code;
        }
        response.status(status).json(contractBody);
        return;
      }

      response.status(status).json({ error: exception.message });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'Internal Server Error',
    });
  }
}

/** Identifies Nest throttling errors so they receive the established 429 response body. */
function isThrottlerException(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'name' in exception &&
    exception.name === 'ThrottlerException'
  );
}

/** Detects Express JSON parser failures for routes with custom malformed-body contracts. */
function isEntityParseFailed(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'type' in exception &&
    exception.type === 'entity.parse.failed'
  );
}

/** Recognizes JSON syntax errors that need the registration route's legacy error shape. */
function isJsonParserMessage(message: string): boolean {
  return /^(Expected property name|Expected double-quoted property name|Unexpected end of JSON input|Unexpected token .* (?:in JSON at position|is not valid JSON)|Bad control character in string literal in JSON at position)/.test(
    message,
  );
}
