import { BadRequestException, HttpException, Logger, UnauthorizedException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { ApiExceptionFilter } from '../../../../src/common/filters/api-exception.filter';
import { ApiResponseException } from '../../../../src/common/exceptions/api-response.exception.js';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

function createHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };
  const request = { method: 'GET', path: '/', originalUrl: '/' };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, request, response };
}

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it('shapes message exceptions as { error: string }', () => {
    const { host, response } = createHost();

    filter.catch(new BadRequestException('Invalid phone number format'), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: 'Invalid phone number format' });
  });

  it('normalizes malformed registration JSON to the legacy response', () => {
    const { host, request, response } = createHost();
    request.method = 'POST';
    request.path = '/api/v2/register';
    request.originalUrl = '/api/v2/register?source=test';
    const error = new BadRequestException(
      "Expected property name or '}' in JSON at position 1 (line 1 column 2)",
    );

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: 'Invalid JSON body' });
  });

  it('normalizes strict-parser errors for JSON primitives on registration', () => {
    const { host, request, response } = createHost();
    request.method = 'POST';
    request.path = '/api/v2/register';
    const error = new BadRequestException(`Unexpected token 'n', "null" is not valid JSON`);

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: 'Invalid JSON body' });
  });

  it.each([
    [
      '/api/v2/auth?source=test',
      {
        error: 'Bad Request',
        message: "Request body must contain a valid 'transaction' field.",
      },
    ],
    ['/api/v2/auth/pin/verify', { error: 'A valid phone number and PIN are required.' }],
    ['/api/v2/register', { error: 'Invalid JSON body' }],
  ])('normalizes malformed JSON for %s', (originalUrl, body) => {
    const { host, request, response } = createHost();
    request.method = 'POST';
    request.originalUrl = originalUrl;
    const error = Object.assign(new SyntaxError('Unexpected token'), {
      type: 'entity.parse.failed',
    });

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(body);
  });

  it('passes an ApiResponseException response through verbatim', () => {
    const { host, response } = createHost();
    const body = { error: 'Unauthorized', message: 'Account is not funded.' };

    filter.catch(new ApiResponseException(401, body), host);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith(body);
  });

  it('keeps plain UnauthorizedException responses in the legacy error shape', () => {
    const { host, response } = createHost();

    filter.catch(new UnauthorizedException('x'), host);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ error: 'x' });
  });

  it('preserves attemptsRemaining in the legacy error shape', () => {
    const { host, response } = createHost();

    filter.catch(
      new UnauthorizedException({ error: 'Invalid verification code.', attemptsRemaining: 3 }),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Invalid verification code.',
      attemptsRemaining: 3,
    });
  });

  it('preserves retryAfter in a locked response', () => {
    const { host, response } = createHost();

    filter.catch(
      new HttpException(
        { error: 'Too many incorrect PIN attempts. Please try again later.', retryAfter: 900 },
        423,
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(423);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Too many incorrect PIN attempts. Please try again later.',
      retryAfter: 900,
    });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '900');
  });

  it('does not set Retry-After for a non-423 exception with retryAfter', () => {
    const { host, response } = createHost();

    filter.catch(new HttpException({ error: 'Rate limited.', retryAfter: 30 }, 429), host);

    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('normalizes throttler exceptions by name to the legacy 429 body', () => {
    const { host, response } = createHost();
    const error = Object.assign(new Error('ThrottlerException'), {
      name: 'ThrottlerException',
    });

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith({
      error: 'Too many requests. Please try again later.',
    });
  });

  it('logs unexpected errors and returns the legacy 500 body', () => {
    const { host, response } = createHost();
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const error = new Error('unexpected failure');

    try {
      filter.catch(error, host);

      expect(loggerError).toHaveBeenCalledWith(error.stack);
      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
    } finally {
      loggerError.mockRestore();
    }
  });

  it('preserves the SMS failure code alongside the legacy error field', () => {
    const { host, response } = createHost();

    filter.catch(
      new HttpException(
        { error: "We couldn't send the SMS. Please try again.", code: 'SMS_FAILED' },
        502,
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.json).toHaveBeenCalledWith({
      error: "We couldn't send the SMS. Please try again.",
      code: 'SMS_FAILED',
    });
  });

  it('preserves the { found: false } lookup response', () => {
    const { host, response } = createHost();

    filter.catch(new HttpException({ found: false }, 404), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ found: false });
  });
});
