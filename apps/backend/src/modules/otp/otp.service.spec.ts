import { BadRequestException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type Redis from 'ioredis';
import { verifyVerificationToken } from '../../common/utils/otp.util';
import { RedisService } from '../../infra/redis/redis.service';
import { OtpRateLimitService } from '../../infra/redis/otp-rate-limit.service';
import { TextbeeService } from './textbee.service';
import { OtpService } from './otp.service';
import { SendOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

type SendSms = (
  phone: string,
  message: string,
  opts?: { retries?: number; timeoutMs?: number; deadlineMs?: number },
) => Promise<void>;

function createService(
  configValues: Record<string, string | boolean> = {},
  sendSms: jest.Mock<SendSms> = jest.fn<SendSms>().mockResolvedValue(undefined),
) {
  const values = new Map(Object.entries(configValues));
  const config = {
    get: jest.fn((key: string) => values.get(key)),
  } as unknown as ConfigService;
  const valuesStore = new Map<string, string>();
  const redis = {
    get: jest.fn(async (key: string) => valuesStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, ..._rest: unknown[]) => {
      valuesStore.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => {
      for (const key of keys) valuesStore.delete(key);
      return keys.length;
    }),
    eval: jest.fn(async (
      _script: string,
      keyCount: number,
      otpKey: string,
      attemptsKey: string,
      _ttlSeconds: string,
      maxAttempts: string,
    ) => {
      expect(keyCount).toBe(2);
      const attempts = Number(valuesStore.get(attemptsKey) ?? 0) + 1;
      valuesStore.set(attemptsKey, String(attempts));
      if (attempts >= Number(maxAttempts)) {
        valuesStore.delete(otpKey);
        valuesStore.delete(attemptsKey);
      }
      return attempts;
    }),
  };
  const textbee = { send: sendSms } as unknown as TextbeeService;
  const redisService = { getClient: () => redis as unknown as Redis } as RedisService;
  const rateLimiter = {
    enforceSendLimits: jest
      .fn<(ip: string, phone: string) => Promise<void>>()
      .mockResolvedValue(undefined),
  };  const service = new OtpService(
    textbee,
    redisService,
    config,
    rateLimiter as unknown as OtpRateLimitService,
  );

  return { service, redis, textbee: sendSms, rateLimiter, valuesStore };
}

describe('OtpService', () => {
  it('stores an OTP in Redis and sends it through TextBee for a non-test phone', async () => {
    const sendSms = jest.fn<SendSms>().mockResolvedValue(undefined);          // tests 1 and 4
    const { service, redis, rateLimiter, valuesStore } = createService({}, sendSms);

    const response = await service.send('09000000001', '203.0.113.1');
    const storedCode = valuesStore.get('honebill:otp:+639000000001');

    expect(redis.set).toHaveBeenCalledWith(
      'honebill:otp:+639000000001',
      expect.stringMatching(/^\d{6}$/),
      'EX',
      300,
    );
    expect(sendSms).toHaveBeenCalledWith(
      '+639000000001',
      expect.stringMatching(/^HoneBill: Your verification code is \d{6}\. Valid for 5 minutes\./),
      { retries: 1, timeoutMs: 4000, deadlineMs: 8000 },
    );
    expect(rateLimiter.enforceSendLimits).toHaveBeenCalledWith('203.0.113.1', '+639000000001');
    expect(response).toEqual({ success: true, message: 'OTP sent successfully.' });
    expect(storedCode).toMatch(/^\d{6}$/);
  });

  it('removes the OTP and does not claim success when SMS delivery fails', async () => {
    const sendSms = jest.fn<SendSms>().mockRejectedValue(new Error('gateway unavailable')); // test 2
    const { service, valuesStore } = createService({}, sendSms);

    const error = await service.send('09000000002', '203.0.113.2').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(502);
    expect((error as HttpException).getResponse()).toEqual({
      error: "We couldn't send the SMS. Please try again.",
      code: 'SMS_FAILED',
    });
    expect(valuesStore.has('honebill:otp:+639000000002')).toBe(false);
  });

  it('uses the fixed code only for an allow-listed test phone and skips TextBee', async () => {
    const sendSms = jest.fn<SendSms>();// test 3
    const { service, valuesStore } = createService(
      {
        OTP_TEST_MODE: true,
        OTP_TEST_NUMBERS: '09000000001',
        OTP_TEST_CODE: '012345',
      },
      sendSms,
    );

    await expect(service.send('09000000001', '203.0.113.1')).resolves.toEqual({
      success: true,
      message: 'OTP sent successfully.',
    });
    expect(sendSms).not.toHaveBeenCalled();
    expect(valuesStore.get('honebill:otp:+639000000001')).toBe('012345');
  });

  it('does not use the fixed test code for a phone outside the allow-list', async () => {
    const sendSms = jest.fn<SendSms>().mockResolvedValue(undefined);          // tests 1 and 4
    const { service } = createService(
      {
        OTP_TEST_MODE: true,
        OTP_TEST_NUMBERS: '09000000001',
        OTP_TEST_CODE: '012345',
      },
      sendSms,
    );

    await expect(service.send('09000000002', '203.0.113.2')).resolves.toEqual({
      success: true,
      message: 'OTP sent successfully.',
    });
    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms.mock.calls[0]?.[1]).not.toContain('012345');
  });

  it('counts wrong codes in Redis, returns remaining attempts, then deletes the OTP at the limit', async () => {
    const { service, valuesStore, redis } = createService({
      OTP_TEST_MODE: true,
      OTP_TEST_NUMBERS: '09000000003',
      OTP_TEST_CODE: '012345',
    });
    await service.send('09000000003', '203.0.113.3');

    for (const attemptsRemaining of [4, 3, 2, 1]) {
      await expect(service.verify('09000000003', '999999')).rejects.toMatchObject({
        response: { error: 'Invalid verification code.', attemptsRemaining },
      });
    }
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', KEYS[2])"),
      2,
      'honebill:otp:+639000000003',
      'honebill:otp:attempts:+639000000003',
      '300',
      '5',
    );
    const locked = await service.verify('09000000003', '999999').catch((error: unknown) => error);
    expect(locked).toBeInstanceOf(HttpException);
    expect((locked as HttpException).getStatus()).toBe(429);
    expect((locked as HttpException).getResponse()).toEqual({
      error: 'Too many incorrect attempts. Please request a new code.',
    });
    expect(valuesStore.has('honebill:otp:+639000000003')).toBe(false);
    expect(valuesStore.has('honebill:otp:attempts:+639000000003')).toBe(false);
  });

  it('rejects expired codes and binds verification JWTs to the verified phone', async () => {
    const { service, valuesStore } = createService(
      {
        OTP_TEST_MODE: true,
        OTP_TEST_NUMBERS: '09000000004',
        OTP_TEST_CODE: '012345',
        OTP_VERIFICATION_JWT_SECRET: 'fake-otp-secret',
      },
    );
    await expect(service.verify('09000000004', '012345')).rejects.toBeInstanceOf(BadRequestException);
    await service.send('09000000004', '203.0.113.4');

    const verification = await service.verify('09000000004', '012345');
    expect(verification).toMatchObject({ success: true });
    expect(verification.verificationToken).toEqual(expect.any(String));
    expect(
      verifyVerificationToken(
        verification.verificationToken ?? '',
        '09000000004',
        'fake-otp-secret',
      ),
    ).toBe(true);
    expect(
      verifyVerificationToken(
        verification.verificationToken ?? '',
        '09000000005',
        'fake-otp-secret',
      ),
    ).toBe(false);
    expect(valuesStore.has('honebill:otp:+639000000004')).toBe(false);
  });

  it('returns 503 when Redis is unavailable', async () => {
    const { service, redis } = createService();
    redis.get.mockRejectedValue(new Error('redis unavailable'));

    const error = await service.verify('09000000006', '123456').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
  });

  it('scopes challenges and tokens to the requested purpose', async () => {
    const secret = 'fixture-otp-secret';
    const phone = '+639000000004';
    const { service, valuesStore } = createService({ OTP_VERIFICATION_JWT_SECRET: secret, OTP_REQUIRE_PURPOSE: true });
    await expect(service.send(phone, '203.0.113.4')).rejects.toBeInstanceOf(BadRequestException);
    await service.send(phone, '203.0.113.4', 'signup');
    const code = valuesStore.get(`honebill:otp:signup:${phone}`)!;
    await expect(service.verify(phone, code, 'change_email')).rejects.toBeInstanceOf(BadRequestException);
    const { verificationToken } = await service.verify(phone, code, 'signup');
    expect(verifyVerificationToken(verificationToken!, phone, secret, 'signup')).toBe(true);
    expect(verifyVerificationToken(verificationToken!, phone, secret, 'reset_mpin', true)).toBe(false);
    expect(verifyVerificationToken(verificationToken!, '+639000000005', secret, 'signup')).toBe(false);
  });

  it('cannot verify an outstanding pre-deployment code or issue a test code in production', async () => {
    const phone = '+639000000004';
    const { service, textbee, valuesStore } = createService({
      NODE_ENV: 'production',
      OTP_VERIFICATION_JWT_SECRET: 'fixture-otp-secret',
      OTP_TEST_MODE: true,
      OTP_TEST_NUMBERS: phone,
      OTP_TEST_CODE: '012345',
    });
    valuesStore.set(`honebill:otp:${phone}`, '012345');
    await expect(service.verify(phone, '012345')).rejects.toBeInstanceOf(BadRequestException);
    await service.send(phone, '203.0.113.4');
    expect(valuesStore.get(`honebill:otp:production:${phone}`)).toMatch(/^\d{6}$/);
    expect(textbee).toHaveBeenCalledTimes(1);
  });

  it('accepts the purpose field for both OTP HTTP bodies and rejects unknown or null purposes', async () => {
    const phoneNumber = '+639000000004';
    const body = { phoneNumber, code: '123456', purpose: 'signup' };
    const options = { whitelist: true, forbidNonWhitelisted: true };
    await expect(validate(plainToInstance(SendOtpDto, { phoneNumber, purpose: 'signup' }), options)).resolves.toEqual([]);
    await expect(validate(plainToInstance(VerifyOtpDto, body), options)).resolves.toEqual([]);
    for (const purpose of [null, 'wrong-purpose']) {
      await expect(validate(plainToInstance(VerifyOtpDto, { ...body, purpose }), options))
        .resolves.toEqual([expect.objectContaining({ property: 'purpose' })]);
    }
  });

  it('applies the send limiter before writing an OTP and propagates the limit error', async () => {
    const limited = new HttpException(
      { error: 'Too many OTP requests. Please wait a few minutes.' },
      429,
    );
    const { service, redis, rateLimiter } = createService();
    rateLimiter.enforceSendLimits.mockRejectedValue(limited);

    await expect(service.send('09000000007', '203.0.113.7')).rejects.toBe(limited);
    expect(rateLimiter.enforceSendLimits).toHaveBeenCalledWith('203.0.113.7', '+639000000007');
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('distinguishes missing and malformed phone numbers', async () => {
    const { service, rateLimiter } = createService();

    await expect(service.send('', '203.0.113.8')).rejects.toMatchObject({
      response: { message: 'Phone number is required.' },
    });
    await expect(service.send('not-a-phone', '203.0.113.8')).rejects.toMatchObject({
      response: { message: 'Invalid phone number format.' },
    });
    expect(rateLimiter.enforceSendLimits).not.toHaveBeenCalled();
  });
});
