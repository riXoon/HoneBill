import { BadRequestException, HttpException, Logger, UnauthorizedException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { LegacyHttpExceptionFilter } from './legacy-http-exception.filter';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

function createHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

describe('LegacyHttpExceptionFilter', () => {
  const filter = new LegacyHttpExceptionFilter();

  it('shapes message exceptions as { error: string }', () => {
    const { host, response } = createHost();

    filter.catch(new BadRequestException('Invalid phone number format'), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: 'Invalid phone number format' });
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
