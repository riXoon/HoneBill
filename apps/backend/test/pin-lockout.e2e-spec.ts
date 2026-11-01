import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisService } from '../src/infra/redis/redis.service.js';
import { AccountsService } from '../src/modules/accounts/accounts.service.js';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { toDbPhone } from '../src/common/utils/phone.util.js';

type AccountRow = { id: number; pin: string | null };

describe('PIN lockout with real Redis (e2e)', () => {
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
  });
  // Unique phone per run, so leftover keys never affect the result.
  const phone = `0917${Math.floor(1000000 + Math.random() * 8999999)}`;
  const failKey = `honebill:pin:fail:${toDbPhone(phone)}`;

  const prisma = {
    account: {
      findFirst: jest
        .fn<(args?: unknown) => Promise<AccountRow | null>>()
        .mockResolvedValue({ id: 1, pin: '1234' }),
      update: jest.fn<(args: unknown) => Promise<void>>().mockResolvedValue(undefined),
    },
  };

  let app: INestApplication;

  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AccountsService,
        { provide: AuthService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: { getClient: () => redis } },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    const instance = moduleRef.createNestApplication();
    instance.setGlobalPrefix('api');
    instance.useGlobalFilters(new ApiExceptionFilter());
    await instance.init();
    return instance;
  }

  const verify = (target: INestApplication, pin: string) =>
    request(target.getHttpServer())
      .post('/api/auth/pin/verify')
      .send({ phoneNumber: phone, pin });

  beforeAll(async () => {
    await redis.del(failKey);
    app = await buildApp();
  });

  afterAll(async () => {
    await redis.del(failKey);
    await app.close();
    await redis.quit();
  });

  it('counts failures, locks on the 5th, sets a TTL, and stays locked after a restart', async () => {
    for (const attemptsRemaining of [4, 3, 2, 1]) {
      await verify(app, '0000').expect(401, { error: 'Incorrect PIN.', attemptsRemaining });
    }

    const locked = await verify(app, '0000').expect(423);
    expect(locked.body).toEqual({
      error: 'Too many incorrect PIN attempts. Please try again later.',
      retryAfter: 900,
    });
    expect(locked.headers['retry-after']).toBe('900');

    const ttl = await redis.ttl(failKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(900);

    // The correct PIN is still locked out.
    await verify(app, '1234').expect(423);

    // "Restart": a brand-new app instance sharing the same Redis is still locked.
    await app.close();
    app = await buildApp();
    const afterRestart = await verify(app, '1234').expect(423);
    expect(afterRestart.body.retryAfter).toBeGreaterThan(0);
    expect(afterRestart.body.retryAfter).toBeLessThanOrEqual(900);
  });

  it('unlocks when the key expires, and a correct PIN clears the counter', async () => {
    await redis.del(failKey); // simulates the 15 minutes passing

    await verify(app, '0000').expect(401, { error: 'Incorrect PIN.', attemptsRemaining: 4 });
    await verify(app, '1234').expect(200, { success: true });
    expect(await redis.exists(failKey)).toBe(0);
  });
});