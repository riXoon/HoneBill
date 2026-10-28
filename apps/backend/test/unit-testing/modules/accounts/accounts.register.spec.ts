import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConflictException, HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../../src/infra/prisma/prisma.service';
import type { RedisService } from '../../../../src/infra/redis/redis.service';
import { AccountsService } from '../../../../src/modules/accounts/accounts.service';
import { signVerificationToken, verifyVerificationToken } from '../../../../src/common/utils/otp.util';
import { verifyPin } from '../../../../src/common/utils/pin.util';
import { LegacyBodyException } from '../../../../src/common/exceptions/legacy-body.exception';

const VALID_PUBLIC_KEY = `G${'A'.repeat(55)}`;
const VALID_PHONE = '09000000001';

function createService() {
  const prisma = {
    account: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null),
      create: jest
        .fn<(args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>>()
        .mockImplementation(async ({ data }) => ({
          id: 1,
          ...data,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        })),
    },
  };

  return {
    prisma,
    service: new AccountsService(
      prisma as unknown as PrismaService,
      {} as RedisService,
      { get: (key: string) => process.env[key] } as unknown as ConfigService,
    ),
  };
}

describe('signup security', () => {
  const originalRequireOtpToken = process.env.REQUIRE_OTP_TOKEN;
  const originalOtpSecret = process.env.OTP_VERIFICATION_JWT_SECRET;

  afterEach(() => {
    if (originalRequireOtpToken === undefined) {
      delete process.env.REQUIRE_OTP_TOKEN;
    } else {
      process.env.REQUIRE_OTP_TOKEN = originalRequireOtpToken;
    }

    if (originalOtpSecret === undefined) {
      delete process.env.OTP_VERIFICATION_JWT_SECRET;
    } else {
      process.env.OTP_VERIFICATION_JWT_SECRET = originalOtpSecret;
    }
  });

  it('rejects malformed Stellar keys before querying or creating an account', async () => {
    const { prisma, service } = createService();

    await expect(service.register({ stellarPublicKey: 'not-a-stellar-key' })).rejects.toThrow(
      'Invalid Stellar Public Key format',
    );
    expect(prisma.account.findUnique).not.toHaveBeenCalled();
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it('validates an invalid phone before database lookups', async () => {
    const { prisma, service } = createService();

    const error = await service
      .register({ stellarPublicKey: VALID_PUBLIC_KEY, phoneNumber: 'not-a-phone' })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(400);
    expect((error as HttpException).getResponse()).toEqual({
      error: 'Validation failed',
      fieldErrors: { phoneNumber: 'Invalid phone number.' },
    });
    expect(prisma.account.findUnique).not.toHaveBeenCalled();
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it('requires a valid phone-verification token when OTP enforcement is enabled', async () => {
    const { prisma, service } = createService();
    process.env.REQUIRE_OTP_TOKEN = 'true';
    process.env.OTP_VERIFICATION_JWT_SECRET = 'signup-test-secret';

    await expect(
      service.register({ stellarPublicKey: VALID_PUBLIC_KEY, phoneNumber: VALID_PHONE }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.account.findUnique).not.toHaveBeenCalled();
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it('rejects a verification token bound to a different phone number', async () => {
    const { prisma, service } = createService();
    process.env.REQUIRE_OTP_TOKEN = 'true';
    process.env.OTP_VERIFICATION_JWT_SECRET = 'signup-test-secret';
    const token = signVerificationToken('+639000000002', process.env.OTP_VERIFICATION_JWT_SECRET);

    await expect(
      service.register({
        stellarPublicKey: VALID_PUBLIC_KEY,
        phoneNumber: VALID_PHONE,
        verificationToken: token ?? '',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate Stellar public keys and phone numbers without creating an account', async () => {
    const { prisma, service } = createService();
    prisma.account.findUnique.mockResolvedValue({ id: 7 } as never);

    await expect(service.register({ stellarPublicKey: VALID_PUBLIC_KEY })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.account.create).not.toHaveBeenCalled();

    prisma.account.findUnique.mockResolvedValue(null);
    prisma.account.findFirst.mockResolvedValue({ id: 8 } as never);
    await expect(
      service.register({ stellarPublicKey: VALID_PUBLIC_KEY, phoneNumber: VALID_PHONE }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it('maps unique phone and Stellar-key insert races to conflict responses', async () => {
    const phoneDuplicate = createService();
    phoneDuplicate.prisma.account.create.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['phone_number'] },
    });
    await expect(
      phoneDuplicate.service.register({
        stellarPublicKey: VALID_PUBLIC_KEY,
        phoneNumber: VALID_PHONE,
      }),
    ).rejects.toThrow('Phone number is already registered.');

    const keyDuplicate = createService();
    keyDuplicate.prisma.account.create.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['stellar_public_key'] },
    });
    await expect(
      keyDuplicate.service.register({ stellarPublicKey: VALID_PUBLIC_KEY }),
    ).rejects.toThrow('Stellar Public Key is already registered.');
  });

  it('retries a short-ID collision only', async () => {
    const { prisma, service } = createService();
    prisma.account.create.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: ['short_id'] },
    });

    await expect(service.register({ stellarPublicKey: VALID_PUBLIC_KEY })).resolves.toMatchObject({
      success: true,
    });
    expect(prisma.account.create).toHaveBeenCalledTimes(2);
  });

  it('returns the legacy 500 response after exhausting short-ID retries', async () => {
    const { prisma, service } = createService();
    prisma.account.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['short_id'] },
    });

    await expect(service.register({ stellarPublicKey: VALID_PUBLIC_KEY })).rejects.toMatchObject({
      status: 500,
      legacyBody: {
        error: 'Failed to generate a unique short ID. Please try again.',
      },
    });
    expect(prisma.account.create).toHaveBeenCalledTimes(5);
  });

  it('stores blank optional strings as null and lowercases a nonblank email', async () => {
    const { prisma, service } = createService();

    await service.register({
      stellarPublicKey: VALID_PUBLIC_KEY,
      firstName: '  ',
      lastName: '\t',
      email: '  USER@Example.com ',
    });

    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: null,
          lastName: null,
          email: 'user@example.com',
        }),
      }),
    );
  });

  it('stores only a PIN hash and never returns the PIN or hash in the registration response', async () => {
    const { prisma, service } = createService();
    const result = await service.register({
      stellarPublicKey: VALID_PUBLIC_KEY,
      phoneNumber: VALID_PHONE,
      pin: '123456',
    });
    const createCall = prisma.account.create.mock.calls[0]?.[0] as {
      data: { pin: string | null };
    };
    const storedPin = createCall.data.pin;

    expect(storedPin).toEqual(expect.stringMatching(/^scrypt\$/));
    expect(storedPin).not.toBe('123456');
    await expect(verifyPin('123456', storedPin ?? '')).resolves.toMatchObject({
      ok: true,
      needsRehash: false,
    });
    expect(result).not.toHaveProperty('data.pin');
    expect(result).not.toHaveProperty('statusCode');
    expect(JSON.stringify(result)).not.toContain(storedPin ?? '');
  });

  it('accepts a phone-verification token for the normalized registration phone', async () => {
    const { service } = createService();
    process.env.OTP_VERIFICATION_JWT_SECRET = 'signup-test-secret';
    const token = signVerificationToken('+639000000001', process.env.OTP_VERIFICATION_JWT_SECRET);

    expect(token).not.toBeNull();
    expect(
      verifyVerificationToken(token ?? '', '09000000001', process.env.OTP_VERIFICATION_JWT_SECRET),
    ).toBe(true);
    await expect(
      service.register({
        stellarPublicKey: VALID_PUBLIC_KEY,
        phoneNumber: VALID_PHONE,
        verificationToken: token ?? '',
      }),
    ).resolves.toMatchObject({ success: true });
  });
});
