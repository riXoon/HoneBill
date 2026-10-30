import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import {
  INestApplication,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LegacyBodyException } from '../src/common/exceptions/legacy-body.exception.js';
import { LegacyHttpExceptionFilter } from '../src/common/filters/legacy-http-exception.filter.js';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { AccountsController } from '../src/modules/accounts/accounts.controller.js';
import { AccountsService } from '../src/modules/accounts/accounts.service.js';
import { OtpController } from '../src/modules/otp/otp.controller.js';
import { OtpService } from '../src/modules/otp/otp.service.js';
import { RateLimitedException } from '../src/infra/redis/otp-rate-limit.service.js';

describe('Phase 2 legacy HTTP contract parity (e2e)', () => {
  let app: INestApplication;
  const authService = {
    getChallenge: jest.fn<
      (account: string, memo?: string) => Record<string, unknown>
    >(),
    issueToken: jest.fn<(transaction: string) => Promise<{ token: string }>>(),
  };
  const accountsService = {
    verifyPin: jest.fn<
      (phoneNumber: string, pin: string) => Promise<Record<string, unknown>>
    >(),
    register: jest.fn<(payload: Record<string, unknown>) => Promise<Record<string, unknown>>>(),
    checkUser: jest.fn<(phone: string) => Promise<Record<string, unknown>>>(),
    lookupUser: jest.fn<
      (shortId?: string, phone?: string) => Promise<Record<string, unknown>>
    >(),
  };
  const otpService = {
    send: jest.fn<(phoneNumber: string, clientIp: string) => Promise<Record<string, unknown>>>(),
    verify: jest.fn<(phoneNumber: string, code: string) => Promise<Record<string, unknown>>>(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, AccountsController, OtpController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: AccountsService, useValue: accountsService },
        { provide: OtpService, useValue: otpService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new LegacyHttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/auth returns the legacy challenge JSON with status 200', async () => {
    authService.getChallenge.mockReturnValue({
      transaction: 'fake-challenge-xdr',
      network_passphrase: 'Test SDF Network ; September 2015',
    });

    await request(app.getHttpServer())
      .get('/api/auth')
      .query({ account: 'GTEST', memo: '123' })
      .expect(200)
      .expect({
        transaction: 'fake-challenge-xdr',
        network_passphrase: 'Test SDF Network ; September 2015',
      });
    expect(authService.getChallenge).toHaveBeenCalledWith('GTEST');
  });

  it('POST /api/auth returns { token } with legacy status 200', async () => {
    authService.issueToken.mockResolvedValue({ token: 'fake-sep10-token' });

    await request(app.getHttpServer())
      .post('/api/auth')
      .send({ transaction: 'fake-signed-challenge-xdr' })
      .expect(200, { token: 'fake-sep10-token' });
    expect(authService.issueToken).toHaveBeenCalledWith('fake-signed-challenge-xdr');
  });

  it('POST /api/auth preserves the scoped legacy unfunded-account body', async () => {
    authService.issueToken.mockRejectedValueOnce(
      new LegacyBodyException(401, {
        error: 'Unauthorized',
        message:
          'Could not load account from the Stellar network. Ensure the account is funded and exists on-chain.',
      }),
    );

    await request(app.getHttpServer())
      .post('/api/auth')
      .send({ transaction: 'fake-signed-challenge-xdr' })
      .expect(401, {
        error: 'Unauthorized',
        message:
          'Could not load account from the Stellar network. Ensure the account is funded and exists on-chain.',
      });
  });

  it('POST /api/auth/pin/verify preserves success and incorrect-PIN contracts', async () => {
    accountsService.verifyPin
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(
        new UnauthorizedException({ error: 'Incorrect PIN.', attemptsRemaining: 4 }),
      );

    await request(app.getHttpServer())
      .post('/api/auth/pin/verify')
      .send({ phoneNumber: '09000000001', pin: '1234' })
      .expect(200, { success: true });
    await request(app.getHttpServer())
      .post('/api/auth/pin/verify')
      .send({ phoneNumber: '09000000001', pin: '0000' })
      .expect(401, { error: 'Incorrect PIN.', attemptsRemaining: 4 });
    expect(accountsService.verifyPin).toHaveBeenNthCalledWith(1, '09000000001', '1234');
  });

  it('POST /api/auth/pin/verify trims PINs and coerces non-strings to empty', async () => {
    accountsService.verifyPin.mockResolvedValue({ success: true });

    await request(app.getHttpServer())
      .post('/api/auth/pin/verify')
      .send({ phoneNumber: '09000000001', pin: ' 1234 ' })
      .expect(200);
    expect(accountsService.verifyPin).toHaveBeenLastCalledWith('09000000001', '1234');

    await request(app.getHttpServer())
      .post('/api/auth/pin/verify')
      .send({ phoneNumber: 9000000001, pin: 1234 })
      .expect(200);
    expect(accountsService.verifyPin).toHaveBeenLastCalledWith('', '');
  });

  it('POST /api/auth/pin/verify with no body does not crash the controller', async () => {
    accountsService.verifyPin.mockRejectedValueOnce(
      new HttpException({ error: 'A valid phone number and PIN are required.' }, 400),
    );

    await request(app.getHttpServer()).post('/api/auth/pin/verify').expect(400);
    expect(accountsService.verifyPin).toHaveBeenCalledWith('', '');
  });

  it('POST /api/auth/pin/verify returns 423 with retryAfter body and Retry-After header', async () => {
  accountsService.verifyPin.mockRejectedValueOnce(
    new HttpException(
      { error: 'Too many incorrect PIN attempts. Please try again later.', retryAfter: 900 },
      423,
    ),
  );

  const res = await request(app.getHttpServer())
    .post('/api/auth/pin/verify')
    .send({ phoneNumber: '09000000001', pin: '1234' })
    .expect(423, {
      error: 'Too many incorrect PIN attempts. Please try again later.',
      retryAfter: 900,
    });
  expect(res.headers['retry-after']).toBe('900');
});

  it('POST /api/otp/send preserves success and rate-limit response contracts', async () => {
    otpService.send
      .mockResolvedValueOnce({
        success: true,
        message: 'OTP sent successfully.',
      })
      .mockRejectedValueOnce(
        new RateLimitedException(
          'Too many OTP requests. Please wait a few minutes.',
          75,
        ),
      );

    await request(app.getHttpServer())
      .post('/api/otp/send')
      .set('X-Forwarded-For', '203.0.113.7, 10.0.0.1')
      .send({ phoneNumber: '09000000002' })
      .expect(200, { success: true, message: 'OTP sent successfully.' });
    expect(otpService.send).toHaveBeenNthCalledWith(1, '09000000002', '203.0.113.7');

    const limited = await request(app.getHttpServer())
      .post('/api/otp/send')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ phoneNumber: '09000000002' })
      .expect(429, { error: 'Too many OTP requests. Please wait a few minutes.' });
    expect(limited.headers['retry-after']).toBe('75');
  });

  it('POST /api/otp/verify preserves success and invalid-code contracts', async () => {
    otpService.verify
      .mockResolvedValueOnce({
        success: true,
        message: 'Phone number verified.',
        verificationToken: 'fake-otp-token',
        expiresIn: 1800,
      })
      .mockRejectedValueOnce(
        new UnauthorizedException({
          error: 'Invalid verification code.',
          attemptsRemaining: 4,
        }),
      );

    await request(app.getHttpServer())
      .post('/api/otp/verify')
      .send({ phoneNumber: '09000000003', code: '123456' })
      .expect(200, {
        success: true,
        message: 'Phone number verified.',
        verificationToken: 'fake-otp-token',
        expiresIn: 1800,
      });
    await request(app.getHttpServer())
      .post('/api/otp/verify')
      .send({ phoneNumber: '09000000003', code: '000000' })
      .expect(401, { error: 'Invalid verification code.', attemptsRemaining: 4 });
    expect(otpService.verify).toHaveBeenNthCalledWith(1, '09000000003', '123456');
  });

  it('POST /api/register keeps the legacy 201 success status and conflict shape', async () => {
    accountsService.register
      .mockResolvedValueOnce({ success: true, data: { id: 'fake-account-id' } })
      .mockRejectedValueOnce(
        new HttpException({ error: 'Phone number is already registered.' }, 409),
      );

    await request(app.getHttpServer())
      .post('/api/register')
      .send({ stellarPublicKey: 'GTEST', phoneNumber: '09000000004' })
      .expect(201, { success: true, data: { id: 'fake-account-id' } });
    await request(app.getHttpServer())
      .post('/api/register')
      .send({ stellarPublicKey: 'GTEST', phoneNumber: '09000000004' })
      .expect(409, { error: 'Phone number is already registered.' });
  });

  it('GET /api/users/check returns the legacy not-found result with status 200', async () => {
    accountsService.checkUser.mockResolvedValue({ exists: false });

    await request(app.getHttpServer())
      .get('/api/users/check')
      .query({ phone: '09000000005' })
      .expect(200, { exists: false });
    expect(accountsService.checkUser).toHaveBeenCalledWith('09000000005');
  });

  it('GET /api/users/lookup preserves the legacy { found: false } 404 shape', async () => {
    accountsService.lookupUser.mockRejectedValue(new HttpException({ found: false }, 404));

    await request(app.getHttpServer())
      .get('/api/users/lookup')
      .query({ shortId: 'AbC123' })
      .expect(404, { found: false });
    expect(accountsService.lookupUser).toHaveBeenCalledWith('AbC123', undefined);
  });
});
