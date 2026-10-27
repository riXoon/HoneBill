import { describe, expect, it, jest } from '@jest/globals';
import Redis from 'ioredis';
import { RedisService } from '../../../infra/redis/redis.service';
import { RedisHealthIndicator } from './redis.health';

describe('RedisHealthIndicator', () => {
  it('pings the lazy Redis client without calling connect repeatedly', async () => {
    const redis = {
      ping: jest.fn<() => Promise<string>>().mockResolvedValue('PONG'),
      connect: jest.fn<() => Promise<void>>(),
    } as unknown as Redis;
    const indicator = new RedisHealthIndicator({
      getClient: () => redis,
    } as unknown as RedisService);

    await expect(indicator.pingCheck('redis')).resolves.toEqual({
      redis: { status: 'up' },
    });
    expect(redis.ping).toHaveBeenCalledTimes(1);
    expect(redis.connect).not.toHaveBeenCalled();
  });
});
