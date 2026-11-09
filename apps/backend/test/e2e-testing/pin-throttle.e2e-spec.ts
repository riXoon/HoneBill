import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter.js';
import { AccountsService } from '../../src/modules/accounts/accounts.service.js';
import { AuthController } from '../../src/modules/auth/auth.controller.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';

// Same global throttler as AppModule (120 per minute), plus the route-level override on pin/verify.
describe('PIN verify IP throttle (e2e)', () => {
  let app: INestApplication;

  const authService = {
    getChallenge: jest
      .fn<(account: string, memo?: string) => Record<string, unknown>>()
      .mockReturnValue({ transaction: 'fake-xdr', network_passphrase: 'fake-passphrase' }),
  };
  const accountsService = {
    verifyPin: jest
      .fn<(phoneNumber: string, pin: string) => Promise<Record<string, unknown>>>()
      .mockResolvedValue({ success: true }),
  };

  // A fresh app per test gives a fresh in-memory throttler counter.
  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }] })],
      controllers: [AuthController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: AuthService, useValue: authService },
        { provide: AccountsService, useValue: accountsService },
      ],
    }).compile();
    const instance = moduleRef.createNestApplication();
    instance.setGlobalPrefix('api/v2');
    instance.useGlobalFilters(new ApiExceptionFilter());
    await instance.init();
    return instance;
  }

  afterEach(async () => {
    await app.close();
  });

  it('allows 30 PIN verifies per minute and rejects the 31st with 429 and Retry-After', async () => {
    app = await buildApp();
    const call = () =>
      request(app.getHttpServer())
        .post('/api/v2/auth/pin/verify')
        .send({ phoneNumber: '09170000001', pin: '1234' });

    for (let i = 0; i < 30; i += 1) {
      await call().expect(200);
    }
    const limited = await call().expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    // TODO: assert the exact legacy 429 body once lib/rate-limit.ts has been compared.
    expect(accountsService.verifyPin).toHaveBeenCalledTimes(30);
  });

  it('does not apply the 30 per minute limit to GET /api/v2/auth', async () => {
    app = await buildApp();
    for (let i = 0; i < 31; i += 1) {
      await request(app.getHttpServer()).get('/api/v2/auth').query({ account: 'GTEST' }).expect(200);
    }
  });
});