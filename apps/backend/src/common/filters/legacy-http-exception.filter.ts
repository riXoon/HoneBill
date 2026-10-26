import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class LegacyHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(LegacyHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

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
