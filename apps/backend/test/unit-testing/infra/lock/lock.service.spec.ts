import { describe, expect, it, jest } from '@jest/globals';
import Redis from 'ioredis';
import { LockService } from '../../../../src/infra/lock/lock.service';
import { RedisService } from '../../../../src/infra/redis/redis.service';

describe('LockService', () => {
  it('acquires a lock once and releases only the matching owner token', async () => {
    const values = new Map<string, string>();
    const redis = {
      set: jest.fn(async (key: string, value: string) => {
        if (values.has(key)) return null;
        values.set(key, value);
        return 'OK';
      }),
      eval: jest.fn(async (_script: string, _count: number, key: string, value: string) => {
        if (values.get(key) !== value) return 0;
        values.delete(key);
        return 1;
      }),
    } as unknown as Redis;
    const service = new LockService({ getClient: () => redis } as unknown as RedisService);

    await expect(service.acquire('relayer', 'owner-1', 10_000)).resolves.toBe(true);
    await expect(service.acquire('relayer', 'owner-2', 10_000)).resolves.toBe(false);
    await expect(service.release('relayer', 'owner-2')).resolves.toBe(false);
    await expect(service.release('relayer', 'owner-1')).resolves.toBe(true);
    await expect(service.acquire('relayer', 'owner-2', 10_000)).resolves.toBe(true);
  });

  it('sets NX and a millisecond TTL when acquiring', async () => {
    const redis = { set: jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('OK') } as unknown as Redis;
    const service = new LockService({ getClient: () => redis } as unknown as RedisService);
    await service.acquire('key', 'token', 1234);
    expect(redis.set).toHaveBeenCalledWith('key', 'token', 'PX', 1234, 'NX');
  });
});
