import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { signVerificationToken } from '../../common/utils/otp.util';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { RedisService } from '../../infra/redis/redis.service';
import { AccountsService, CHANGE_COOLDOWN_SECONDS, cooldownLeft, describeWait } from './accounts.service';

const SECRET = 'test-otp-secret';
const PHONE = '09171234567';
const HOUR = 3600 * 1000;

type Account = { id: number; email: string | null; pinChangedAt: Date | null; emailChangedAt: Date | null };

function makeService(account: Account | null, options: { secret?: string | null; emailOwner?: number | null } = {}) {
  const secret = options.secret === undefined ? SECRET : options.secret;
  const prisma = {
    account: {
      findFirst: jest.fn(async (args: any) => {
        // The "email already in use" lookup filters by email; everything else is the change account.
        if (args?.where?.email !== undefined) return options.emailOwner ? { id: options.emailOwner } : null;
        return account;
      }),
      update: jest.fn(async (args: any) => ({ firstName: null, lastName: null, email: args.data.email ?? account?.email ?? null })),
    },
  };
  const config = { get: jest.fn((key: string) => (key === 'OTP_VERIFICATION_JWT_SECRET' ? (secret ?? undefined) : undefined)) };
  const service = new AccountsService(
    prisma as unknown as PrismaService,
    { getClient: () => ({}) } as unknown as RedisService,
    config as unknown as ConfigService,
  );
  const verifyPin = jest.spyOn(service, 'verifyPin').mockResolvedValue({ success: true });
  return { service, prisma, verifyPin };
}

const token = () => signVerificationToken(PHONE, SECRET)!;
const fresh = (): Account => ({ id: 1, email: 'old@mail.com', pinChangedAt: null, emailChangedAt: null });

describe('cooldown helpers', () => {
  it('counts down from 24 hours and reads in hours or minutes', () => {
    const now = Date.now();
    expect(cooldownLeft(null, now)).toBe(0);
    expect(cooldownLeft(new Date(now - 25 * HOUR), now)).toBe(0);
    expect(cooldownLeft(new Date(now - HOUR), now)).toBe(CHANGE_COOLDOWN_SECONDS - 3600);
    expect(describeWait(23 * 3600)).toBe('23 hours');
    expect(describeWait(3600)).toBe('1 hour');
    expect(describeWait(3601)).toBe('2 hours');
    expect(describeWait(90)).toBe('2 minutes');
    expect(describeWait(5)).toBe('1 minute');
  });
});

describe('changePin', () => {
  it('changes the PIN with a valid SMS code and starts the cooldown', async () => {
    const { service, prisma } = makeService(fresh());
    await expect(service.changePin(PHONE, '1234', '5678', token())).resolves.toEqual({ success: true });
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ pinChangedAt: expect.any(Date) }),
    });
  });

  it('refuses without an SMS code, before checking the PIN', async () => {
    const { service, verifyPin, prisma } = makeService(fresh());
    await expect(service.changePin(PHONE, '1234', '5678')).rejects.toMatchObject({ status: 401 });
    await expect(service.changePin(PHONE, '1234', '5678', 'forged')).rejects.toMatchObject({ status: 401 });
    expect(verifyPin).not.toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('refuses a second change within 24 hours without using up PIN tries', async () => {
    const { service, verifyPin } = makeService({ ...fresh(), pinChangedAt: new Date(Date.now() - HOUR) });
    const error: any = await service.changePin(PHONE, '1234', '5678', token()).catch((e) => e);
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({ code: 'CHANGE_COOLDOWN', retryAfter: expect.any(Number) });
    expect(error.getResponse().error).toContain('23 hours');
    expect(verifyPin).not.toHaveBeenCalled();
  });

  it('skips the SMS code only on a development setup that cannot issue codes', async () => {
    const { service } = makeService(fresh(), { secret: null });
    await expect(service.changePin(PHONE, '1234', '5678')).resolves.toEqual({ success: true });
  });
});

describe('updateProfile email', () => {
  it('saves a new email with a valid SMS code and starts the cooldown', async () => {
    const { service, prisma } = makeService(fresh());
    await service.updateProfile(PHONE, '1234', { email: 'New@Mail.com' }, token());
    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: 'new@mail.com', emailChangedAt: expect.any(Date) } }),
    );
  });

  it('refuses an email another account already uses', async () => {
    const { service, prisma } = makeService(fresh(), { emailOwner: 2 });
    const error: any = await service.updateProfile(PHONE, '1234', { email: 'taken@mail.com' }, token()).catch((e) => e);
    expect(error.getStatus()).toBe(409);
    expect(error.responseBody.fieldErrors.email).toBe('This email is already used by another account.');
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it('refuses a second email change within 24 hours', async () => {
    const { service } = makeService({ ...fresh(), emailChangedAt: new Date(Date.now() - 2 * HOUR) });
    await expect(service.updateProfile(PHONE, '1234', { email: 'new@mail.com' }, token())).rejects.toMatchObject({
      status: 429,
    });
  });

  it('refuses an email change without an SMS code', async () => {
    const { service } = makeService(fresh());
    await expect(service.updateProfile(PHONE, '1234', { email: 'new@mail.com' })).rejects.toMatchObject({ status: 401 });
  });

  it('treats saving the same email again as no change: no code, no cooldown', async () => {
    const { service, prisma } = makeService({ ...fresh(), emailChangedAt: new Date() });
    await service.updateProfile(PHONE, '1234', { email: 'OLD@mail.com' });
    expect(prisma.account.update).toHaveBeenCalledWith(expect.objectContaining({ data: {} }));
  });
});

describe('changeAvailability', () => {
  it('reports each cooldown and whether an email is taken, after checking the PIN', async () => {
    const { service, verifyPin } = makeService(
      { ...fresh(), pinChangedAt: new Date(Date.now() - HOUR) },
      { emailOwner: 2 },
    );
    const result = await service.changeAvailability(PHONE, '1234', 'Taken@Mail.com');
    expect(verifyPin).toHaveBeenCalledWith(PHONE, '1234');
    expect(result.pin.retryAfter).toBeGreaterThan(0);
    expect(result.email.retryAfter).toBe(0);
    expect(result.emailTaken).toBe(true);
  });
});
