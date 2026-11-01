import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../../src/infra/prisma/prisma.service';
import type { RedisService } from '../../../../src/infra/redis/redis.service';
import { AccountsService } from '../../../../src/modules/accounts/accounts.service';

type Query = (args: unknown) => Promise<unknown>;

function createService() {
  const prisma = {
    account: {
      findFirst: jest.fn<Query>().mockResolvedValue(null),
      findUnique: jest.fn<Query>().mockResolvedValue(null),
    },
  };
  const service = new AccountsService(
    prisma as unknown as PrismaService,
    {} as RedisService,
    {} as ConfigService,
  );
  return { service, prisma };
}

const ACCOUNT = {
  shortId: 'aB3xYz',
  stellarPublicKey: `G${'A'.repeat(55)}`,
  offlineDeviceKey: null,
  firstName: 'Juan',
  lastName: 'Dela Cruz',
};

describe('AccountsService.checkUser', () => {
 it('rejects an empty phone with the legacy missing-parameter message', async () => {
  const { service, prisma } = createService();
  await expect(service.checkUser('')).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.checkUser('')).rejects.toThrow('Missing required parameter: phone');
  expect(prisma.account.findFirst).not.toHaveBeenCalled();
});

it('rejects a digit-less phone with the legacy invalid-format message', async () => {
  const { service, prisma } = createService();
  await expect(service.checkUser('abc')).rejects.toThrow('Invalid phone number format');
  await expect(service.checkUser(' ')).rejects.toThrow('Invalid phone number format');
  expect(prisma.account.findFirst).not.toHaveBeenCalled();
});
  it('returns { exists: false } when no account matches', async () => {
    const { service } = createService();
    await expect(service.checkUser('639170000001')).resolves.toEqual({ exists: false });
  });

  it('returns key and shortId when the account exists, and nothing else', async () => {
    const { service, prisma } = createService();
    prisma.account.findFirst.mockResolvedValue({
      stellarPublicKey: ACCOUNT.stellarPublicKey,
      shortId: ACCOUNT.shortId,
    });
    await expect(service.checkUser('639170000001')).resolves.toEqual({
      exists: true,
      stellarPublicKey: ACCOUNT.stellarPublicKey,
      shortId: ACCOUNT.shortId,
    });
  });

  it('strips non-digits before querying', async () => {
    const { service, prisma } = createService();
    await service.checkUser('+63 917-000-0001');
    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phoneNumber: '639170000001' } }),
    );
  });

  it('normalizes a local 09 number to the stored database phone format', async () => {
    const { service, prisma } = createService();
    await service.checkUser('09170000001');
    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phoneNumber: '639170000001' } }),
    );
  });
});

describe('AccountsService.lookupUser', () => {
  it('requires shortId or phone', async () => {
    const { service } = createService();
    await expect(service.lookupUser(undefined, undefined)).rejects.toThrow(
      'Provide at least one query parameter: shortId or phone',
    );
  });

  it('looks up by shortId and builds displayName from the names', async () => {
    const { service, prisma } = createService();
    prisma.account.findUnique.mockResolvedValue(ACCOUNT);
    await expect(service.lookupUser('aB3xYz')).resolves.toEqual({
      found: true,
      shortId: 'aB3xYz',
      stellarPublicKey: ACCOUNT.stellarPublicKey,
      offlineDeviceKey: null,
      displayName: 'Juan Dela Cruz',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
    });
    expect(prisma.account.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shortId: 'aB3xYz' } }),
    );
  });

  it('falls back to shortId as displayName and "" names when none are set', async () => {
    const { service, prisma } = createService();
    prisma.account.findUnique.mockResolvedValue({ ...ACCOUNT, firstName: null, lastName: null });
    await expect(service.lookupUser('aB3xYz')).resolves.toMatchObject({
      displayName: 'aB3xYz',
      firstName: '',
      lastName: '',
    });
  });

  it('uses only the first name when the last name is missing', async () => {
    const { service, prisma } = createService();
    prisma.account.findUnique.mockResolvedValue({ ...ACCOUNT, lastName: null });
    await expect(service.lookupUser('aB3xYz')).resolves.toMatchObject({ displayName: 'Juan' });
  });

  it('returns the offline device key when present', async () => {
    const { service, prisma } = createService();
    const key = `G${'B'.repeat(55)}`;
    prisma.account.findUnique.mockResolvedValue({ ...ACCOUNT, offlineDeviceKey: key });
    await expect(service.lookupUser('aB3xYz')).resolves.toMatchObject({ offlineDeviceKey: key });
  });

  it('looks up by normalized phone when no shortId is given', async () => {
    const { service, prisma } = createService();
    prisma.account.findFirst.mockResolvedValue(ACCOUNT);
    await service.lookupUser(undefined, '+63 917-000-0001');
    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phoneNumber: '639170000001' } }),
    );
    expect(prisma.account.findUnique).not.toHaveBeenCalled();
  });

  it('normalizes a local phone number when looking up an account', async () => {
    const { service, prisma } = createService();
    prisma.account.findFirst.mockResolvedValue(ACCOUNT);
    await service.lookupUser(undefined, '09170000001');
    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phoneNumber: '639170000001' } }),
    );
  });

  it('prefers shortId over phone when both are given', async () => {
    const { service, prisma } = createService();
    prisma.account.findUnique.mockResolvedValue(ACCOUNT);
    await service.lookupUser('aB3xYz', '639170000001');
    expect(prisma.account.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
  });

  it('throws 404 with the legacy body { found: false }', async () => {
    const { service } = createService();
    const error = await service.lookupUser('nope').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({ found: false });
  });
});