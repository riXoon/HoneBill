import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { signVerificationToken } from '../../common/utils/otp.util';
import { verifyPin } from '../../common/utils/pin.util';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { RedisService } from '../../infra/redis/redis.service';
import { AccountsService, emailWait, pinFailKey } from './accounts.service';

const SECRET = 'test-otp-secret';
const PHONE = '09171234567';
const WALLET = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
const HOUR = 3600 * 1000;

type Account = {
  id: number;
  email: string | null;
  stellarPublicKey: string;
  pinChangedAt: Date | null;
  emailChangedAt: Date | null;
  pinResetAt: Date | null;
};

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 1,
  email: 'old@mail.com',
  stellarPublicKey: WALLET,
  pinChangedAt: null,
  emailChangedAt: null,
  pinResetAt: null,
  ...overrides,
});

function makeService(found: Account | null, options: { redisFails?: boolean; strictPurpose?: boolean } = {}) {
  const prisma = {
    account: {
      findFirst: jest.fn(async (..._args: any[]) => found),
      update: jest.fn(async (args: any) => ({ firstName: null, lastName: null, email: args.data.email ?? found?.email ?? null })),
    },
  };
  const del = jest.fn(async (..._args: any[]) => {
    if (options.redisFails) throw new Error('redis down');
    return 1;
  });
  const settings = { OTP_VERIFICATION_JWT_SECRET: SECRET, OTP_REQUIRE_PURPOSE: options.strictPurpose };
  const config = { get: jest.fn((key: keyof typeof settings) => settings[key]) };
  const service = new AccountsService(
    prisma as unknown as PrismaService,
    { getClient: () => ({ del }) } as unknown as RedisService,
    config as unknown as ConfigService,
  );
  return { service, prisma, del };
}

const token = () => signVerificationToken(PHONE, SECRET)!;

describe('resetPin ("Forgot MPIN")', () => {
  it('sets the new MPIN, starts the cooldowns and clears the wrong-PIN lockout', async () => {
    const { service, prisma, del } = makeService(account());
    await expect(service.resetPin(PHONE, '5678', token(), WALLET)).resolves.toEqual({ success: true });

    const data = (prisma.account.update.mock.calls[0][0] as any).data;
    await expect(verifyPin('5678', data.pin)).resolves.toMatchObject({ ok: true });
    expect(data.pinChangedAt).toBeInstanceOf(Date);
    expect(data.pinResetAt).toBeInstanceOf(Date);
    expect(del).toHaveBeenCalledWith(pinFailKey(PHONE));
    expect(pinFailKey(PHONE)).toBe('honebill:pin:fail:639171234567');
  });

  it('is not blocked by the 24-hour limit (the person cannot remember the MPIN)', async () => {
    const { service, prisma } = makeService(account({ pinChangedAt: new Date(Date.now() - HOUR) }));
    await expect(service.resetPin(PHONE, '5678', token(), WALLET)).resolves.toEqual({ success: true });
    expect(prisma.account.update).toHaveBeenCalled();
  });

  it('refuses without a valid SMS code, whatever the wallet proves', async () => {
    const { service, prisma } = makeService(account());
    await expect(service.resetPin(PHONE, '5678', undefined, WALLET)).rejects.toMatchObject({ status: 401 });
    await expect(service.resetPin(PHONE, '5678', 'forged', WALLET)).rejects.toMatchObject({ status: 401 });
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('refuses when the wallet is not the one registered to this number (a SIM swap alone is not enough)', async () => {
    const { service, prisma, del } = makeService(account());
    const error: any = await service.resetPin(PHONE, '5678', token(), 'GSOMEOTHERWALLET').catch((e) => e);
    expect(error.getStatus()).toBe(403);
    expect(error.responseBody.code).toBe('WALLET_MISMATCH');
    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('requires reset-specific SMS proof as well as the account wallet in strict mode', async () => {
    const { service, prisma } = makeService(account(), { strictPurpose: true });
    const recovery = signVerificationToken(PHONE, SECRET, 'recover_device')!;
    const reset = signVerificationToken(PHONE, SECRET, 'reset_mpin')!;
    await expect(service.resetPin(PHONE, '5678', token(), WALLET)).rejects.toMatchObject({ status: 401 });
    await expect(service.resetPin(PHONE, '5678', recovery, WALLET)).rejects.toMatchObject({ status: 401 });
    await expect(service.resetPin(PHONE, '5678', reset, 'GSOMEOTHERWALLET')).rejects.toMatchObject({ status: 403 });
    expect(prisma.account.update).not.toHaveBeenCalled();
    await expect(service.resetPin(PHONE, '5678', reset, WALLET)).resolves.toEqual({ success: true });
  });

  it('refuses an unknown number and a malformed MPIN', async () => {
    await expect(makeService(null).service.resetPin(PHONE, '5678', token(), WALLET)).rejects.toMatchObject({ status: 404 });
    const { service, prisma } = makeService(account());
    await expect(service.resetPin(PHONE, '12', token(), WALLET)).rejects.toMatchObject({ status: 400 });
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('still succeeds when the lockout cannot be cleared (it expires by itself)', async () => {
    const { service } = makeService(account(), { redisFails: true });
    await expect(service.resetPin(PHONE, '5678', token(), WALLET)).resolves.toEqual({ success: true });
  });
});

describe('email pause after a reset', () => {
  it('picks the longer wait and says why', () => {
    const now = Date.now();
    expect(emailWait({ emailChangedAt: null, pinResetAt: null }, now)).toEqual({ retryAfter: 0 });
    expect(emailWait({ emailChangedAt: new Date(now - 2 * HOUR), pinResetAt: null }, now)).toMatchObject({ reason: 'recent' });
    expect(emailWait({ emailChangedAt: null, pinResetAt: new Date(now - HOUR) }, now)).toMatchObject({ reason: 'reset' });
    // Email changed 2 hours ago, MPIN reset 1 hour ago: the reset's pause ends later.
    expect(
      emailWait({ emailChangedAt: new Date(now - 2 * HOUR), pinResetAt: new Date(now - HOUR) }, now).reason,
    ).toBe('reset');
  });

  it('refuses an email change for 24 hours after a reset, with its own message', async () => {
    const { service, prisma } = makeService(account({ pinResetAt: new Date(Date.now() - 2 * HOUR) }));
    const error: any = await service.updateProfile(PHONE, '1234', { email: 'new@mail.com' }, token()).catch((e) => e);
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({ code: 'CHANGE_COOLDOWN', reason: 'reset' });
    expect(error.getResponse().error).toContain('after an MPIN reset');
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('reports the pause to the app before it sends an SMS', async () => {
    const { service } = makeService(account({ pinResetAt: new Date(Date.now() - HOUR) }));
    jest.spyOn(service, 'verifyPin').mockResolvedValue({ success: true });
    const result = await service.changeAvailability(PHONE, '1234');
    expect(result.email.retryAfter).toBeGreaterThan(0);
    expect(result.email.reason).toBe('reset');
  });
});
