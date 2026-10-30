import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LegacyBodyException } from '../exceptions/legacy-body.exception.js';

const BAD_JSON_BODIES: Record<string, unknown> = {
  '/api/auth': {
    error: 'Bad Request',
    message: "Request body must contain a valid 'transaction' field.",
  },
  '/api/auth/pin/verify': { error: 'A valid phone number and PIN are required.' },
  '/api/register': { error: 'Invalid JSON body' },
};

@Catch()
export class LegacyHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(LegacyHttpExceptionFilter.name);

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
      request.path === '/api/register' &&
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

      if (exception instanceof LegacyBodyException) {
        response.status(status).json(exception.legacyBody);
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
        const responseBody = exceptionResponse as Record<string, unknown>;
        const error =
          typeof responseBody.message === 'string'
            ? responseBody.message
            : typeof responseBody.error === 'string'
              ? responseBody.error
              : exception.message;
        const legacyBody: Record<string, unknown> = { error };
        if (typeof responseBody.attemptsRemaining === 'number') {
          legacyBody.attemptsRemaining = responseBody.attemptsRemaining;
        }
        if (typeof responseBody.retryAfter === 'number') {
          legacyBody.retryAfter = responseBody.retryAfter;
        }
        if (typeof responseBody.code === 'string') {
          legacyBody.code = responseBody.code;
        }
        response.status(status).json(legacyBody);
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

function isThrottlerException(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'name' in exception &&
    exception.name === 'ThrottlerException'
  );
}

function isEntityParseFailed(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'type' in exception &&
    exception.type === 'entity.parse.failed'
  );
}

function isJsonParserMessage(message: string): boolean {
  return /^(Expected property name|Expected double-quoted property name|Unexpected end of JSON input|Unexpected token .* (?:in JSON at position|is not valid JSON)|Bad control character in string literal in JSON at position)/.test(
    message,
  );
}
