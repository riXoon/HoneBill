import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { LegacyHttpExceptionFilter } from '../src/common/filters/legacy-http-exception.filter.js';
import { OtpRateLimitService } from '../src/infra/redis/otp-rate-limit.service.js';
import { RedisService } from '../src/infra/redis/redis.service.js';
import { normalizePhoneNumber, toDbPhone } from '../src/common/utils/phone.util.js';
import { OtpController } from '../src/modules/otp/otp.controller.js';
import { OtpService } from '../src/modules/otp/otp.service.js';
import { TextbeeService } from '../src/modules/otp/textbee.service.js';

type SendSms = (phone: string, message: string, opts?: unknown) => Promise<void>;
type Identity = { phone: string; ip: string };

describe('OTP with real Redis (e2e)', () => {
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
  });
  const sendSms = jest.fn<SendSms>().mockResolvedValue(undefined);
  const configValues: Record<string, unknown> = {
    OTP_VERIFICATION_JWT_SECRET: 'e2e-otp-secret-not-real',
  };
  const used: Identity[] = [];
  let app: INestApplication;

  // A fresh phone and IP per test, so rate limits never leak between tests.
  function identity(): Identity {
    const id = {
      phone: `0917${Math.floor(1000000 + Math.random() * 8999999)}`,
      ip: `203.0.113.${Math.floor(1 + Math.random() * 253)}`,
    };
    used.push(id);
    return id;
  }
  const otpKey = (id: Identity) => `pijin:otp:${normalizePhoneNumber(id.phone)}`;
  const attemptsKey = (id: Identity) => `pijin:otp:attempts:${normalizePhoneNumber(id.phone)}`;

  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [OtpController],
      providers: [
        OtpService,
        OtpRateLimitService,
        { provide: TextbeeService, useValue: { send: sendSms } },
        { provide: RedisService, useValue: { getClient: () => redis } },
        {
          provide: ConfigService,
          useValue: { get: (key: string, fallback?: unknown) => configValues[key] ?? fallback },
        },
      ],
    }).compile();
    const instance = moduleRef.createNestApplication();
    instance.setGlobalPrefix('api');
    instance.useGlobalFilters(new LegacyHttpExceptionFilter());
    await instance.init();
    return instance;
  }

  const send = (id: Identity, target: INestApplication = app) =>
    request(target.getHttpServer())
      .post('/api/otp/send')
      .set('X-Forwarded-For', id.ip)
      .send({ phoneNumber: id.phone });

  const verify = (id: Identity, code: string, target: INestApplication = app) =>
    request(target.getHttpServer())
      .post('/api/otp/verify')
      .send({ phoneNumber: id.phone, code });

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(() => {
    sendSms.mockClear();
  });

  afterAll(async () => {
    for (const id of used) {
      const keys = [
        ...(await redis.keys(`*${toDbPhone(id.phone)}*`)),
        ...(await redis.keys(`*${id.ip}*`)),
      ];
      if (keys.length > 0) await redis.del(...keys);
    }
    await app.close();
    await redis.quit();
  });

  it('stores a 6-digit code with a TTL, sends the SMS, and never returns the code', async () => {
    const id = identity();
    const res = await send(id).expect(200);

    expect(res.body).toEqual({ success: true, message: 'OTP sent successfully.' });
    const code = (await redis.get(otpKey(id))) as string;
    expect(code).toMatch(/^\d{6}$/);
    const ttl = await redis.ttl(otpKey(id));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms.mock.calls[0]?.[1]).toContain(code);
  });

  it('verifies the right code, returns a token, and removes both Redis keys', async () => {
    const id = identity();
    await send(id).expect(200);
    const code = (await redis.get(otpKey(id))) as string;

    const res = await verify(id, code).expect(200);
    expect(res.body).toMatchObject({ success: true, message: 'Phone number verified.' });
    expect(typeof res.body.verificationToken).toBe('string');
    expect(res.body.expiresIn).toBeGreaterThan(0);
    expect(await redis.exists(otpKey(id))).toBe(0);
    expect(await redis.exists(attemptsKey(id))).toBe(0);
  });

  it('counts wrong codes, burns the code on the 5th, then reports it expired', async () => {
    const id = identity();
    await send(id).expect(200);
    const code = (await redis.get(otpKey(id))) as string;
    const wrong = code === '999999' ? '000000' : '999999';

    for (const attemptsRemaining of [4, 3, 2, 1]) {
      await verify(id, wrong).expect(401, { error: 'Invalid verification code.', attemptsRemaining });
    }
    const counterTtl = await redis.ttl(attemptsKey(id));
    expect(counterTtl).toBeGreaterThan(0);

    await verify(id, wrong).expect(429, {
      error: 'Too many incorrect attempts. Please request a new code.',
    });
    expect(await redis.exists(otpKey(id))).toBe(0);
    expect(await redis.exists(attemptsKey(id))).toBe(0);

    // Even the real code is gone now.
    const afterBurn = await verify(id, code);
    expect(afterBurn.status).toBe(400);
  });

  it('rate-limits the 4th send for the same IP and phone within 5 minutes', async () => {
    const id = identity();
    for (let i = 0; i < 3; i += 1) {
      await send(id).expect(200);
    }
    const res = await send(id).expect(429, {
      error: 'Too many OTP requests. Please wait a few minutes.',
    });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(sendSms).toHaveBeenCalledTimes(3);
  });

  it('returns 502 SMS_FAILED and deletes the stored code when delivery fails', async () => {
    const id = identity();
    sendSms.mockRejectedValueOnce(new Error('gateway down'));

    await send(id).expect(502, {
      error: "We couldn't send the SMS. Please try again.",
      code: 'SMS_FAILED',
    });
    expect(await redis.exists(otpKey(id))).toBe(0);
  });

  it('still verifies a code after the app restarts', async () => {
    const id = identity();
    await send(id).expect(200);
    const code = (await redis.get(otpKey(id))) as string;

    await app.close();
    app = await buildApp();

    await verify(id, code).expect(200);
  });
});