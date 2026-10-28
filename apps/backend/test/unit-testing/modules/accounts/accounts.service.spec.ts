import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createServer } from 'node:net';
import type { PrismaService } from '../../../../src/infra/prisma/prisma.service';
import { RedisService } from '../../../../src/infra/redis/redis.service';
import { AccountsService } from '../../../../src/modules/accounts/accounts.service';
import { describe, expect, it, jest } from '@jest/globals';
type AccountRow = { id: number; pin: string | null };
function createService(initialFailures = 0) {
  let failures = initialFailures;
  let ttlSeconds = initialFailures > 0 ? 900 : -2;
  const redis = {
  get: jest.fn(async (_key: string) => (failures > 0 ? String(failures) : null)),
  ttl: jest.fn(async (_key: string) => ttlSeconds),
  eval: jest.fn(
    async (_script: string, _keyCount: number, _key: string, _limit: string, ttl: string) => {
      failures += 1;
      if (failures === 1 || failures >= 5) ttlSeconds = Number(ttl);
      return failures;
    },
  ),
  del: jest.fn(async (..._keys: string[]) => {
    failures = 0;
    ttlSeconds = -2;
    return 1;
  }),
};
  const prisma = {
  account: {
    findFirst: jest
      .fn<(args?: unknown) => Promise<AccountRow | null>>()
      .mockResolvedValue({ id: 1, pin: '1234' }),
    update: jest.fn<(args: unknown) => Promise<void>>().mockResolvedValue(undefined),
  },
};
  const service = new AccountsService(
    prisma as unknown as PrismaService,
    { getClient: () => redis } as unknown as RedisService,
    {} as ConfigService,
  );

  return { service, redis, prisma, getFailures: () => failures };
}

async function getThrown(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to reject');
}

describe('AccountsService PIN lockout', () => {
  it('returns remaining attempts 4, 3, 2, 1, then locks and keeps the correct PIN locked', async () => {
    const { service, redis } = createService();

    for (const attemptsRemaining of [4, 3, 2, 1]) {
      const error = await getThrown(service.verifyPin('09000000001', '9999'));
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(401);
      expect((error as HttpException).getResponse()).toEqual({
        error: 'Incorrect PIN.',
        attemptsRemaining,
      });
    }
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      1,
      'pijin:pin:fail:639000000001',
      '5',
      '900',
    );

    const fifthAttempt = await getThrown(service.verifyPin('09000000001', '9999'));
    expect(fifthAttempt).toBeInstanceOf(HttpException);
    expect((fifthAttempt as HttpException).getStatus()).toBe(423);
    expect((fifthAttempt as HttpException).getResponse()).toEqual({
      error: 'Too many incorrect PIN attempts. Please try again later.',
      retryAfter: 900,
    });

    const correctPinDuringLockout = await getThrown(service.verifyPin('09000000001', '1234'));
    expect(correctPinDuringLockout).toBeInstanceOf(HttpException);
    expect((correctPinDuringLockout as HttpException).getStatus()).toBe(423);
    expect(redis.eval).toHaveBeenCalledTimes(5);
  });

  it('clears the Redis failure counter when the correct PIN is entered before lockout', async () => {
    const { service, redis, getFailures } = createService(3);

    await expect(service.verifyPin('09000000001', '1234')).resolves.toEqual({ success: true });

    expect(redis.del).toHaveBeenCalledWith('pijin:pin:fail:639000000001');
    expect(getFailures()).toBe(0);
  });

  it('rehashes a legacy plaintext PIN after a successful verify', async () => {
  const { service, prisma } = createService();

  await expect(service.verifyPin('09000000001', '1234')).resolves.toEqual({ success: true });
  expect(prisma.account.update).toHaveBeenCalledTimes(1);
  const call = prisma.account.update.mock.calls[0]?.[0] as { data: { pin: string } };
  expect(call.data.pin).not.toBe('1234');
});

  it('uses the remaining TTL as retryAfter when already locked', async () => {
    const { service, redis } = createService(5);
    redis.ttl.mockResolvedValue(420);

    const error = await getThrown(service.verifyPin('09000000001', '1234'));
    expect((error as HttpException).getStatus()).toBe(423);
    expect((error as HttpException).getResponse()).toEqual({
      error: 'Too many incorrect PIN attempts. Please try again later.',
      retryAfter: 420,
    });
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('falls back to 900 seconds when the lock has no TTL', async () => {
    const { service, redis } = createService(5);
    redis.ttl.mockResolvedValue(-1);

    const error = await getThrown(service.verifyPin('09000000001', '1234'));
    expect((error as HttpException).getResponse()).toMatchObject({ retryAfter: 900 });
  });

  it('returns 404 when the account does not exist', async () => {
    const { service, prisma, redis } = createService();
    prisma.account.findFirst.mockResolvedValue(null);

    const error = await getThrown(service.verifyPin('09000000001', '1234'));
    expect(error).toBeInstanceOf(NotFoundException);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('rejects a bad phone or PIN format with 400 before touching Redis', async () => {
    const { service, redis } = createService();

    expect(await getThrown(service.verifyPin('', '1234'))).toBeInstanceOf(BadRequestException);
    expect(await getThrown(service.verifyPin('09000000001', '12'))).toBeInstanceOf(BadRequestException);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the failure counter cannot be incremented', async () => {
    const { service, redis } = createService();
    redis.eval.mockRejectedValue(new Error('redis unavailable'));

    const error = await getThrown(service.verifyPin('09000000001', '9999'));
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
  });

  it('fails closed with 503 when Redis is unavailable', async () => {
    const { service } = createService();
    const redis = {
      get: jest.fn<() => Promise<string | null>>().mockRejectedValue(new Error('redis unavailable')),
      ttl: jest.fn<() => Promise<number>>(),
      eval: jest.fn<() => Promise<number>>(),
      del: jest.fn<() => Promise<number>>(),
    };
    const failingService = new AccountsService(
      {} as PrismaService,
      { getClient: () => redis } as unknown as RedisService,
      {} as ConfigService,
    );

    const error = await getThrown(failingService.verifyPin('09000000001', '1234'));
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
  });

  it('returns 503 promptly when the real Redis client cannot reach Redis', async () => {
    const probeServer = createServer();
    await new Promise<void>((resolve, reject) => {
      probeServer.once('error', reject);
      probeServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = probeServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not reserve a local port for the Redis outage test.');
    }
    await new Promise<void>((resolve, reject) => {
      probeServer.close((error) => (error ? reject(error) : resolve()));
    });

    const redisService = new RedisService(
      new ConfigService({
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: address.port,
        REDIS_DB: 0,
      }),
    );
    const unavailableService = new AccountsService(
      {} as PrismaService,
      redisService,
      {} as ConfigService,
    );
    const startedAt = Date.now();

    try {
      const error = await getThrown(unavailableService.verifyPin('09000000001', '1234'));

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
      expect(Date.now() - startedAt).toBeLessThan(6000);
    } finally {
      redisService.getClient().disconnect();
    }
  }, 10000);
});
