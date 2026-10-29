import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

@Injectable()
export class LockService {
  constructor(private readonly redisService: RedisService) {}

  async acquire(key: string, value: string, ttlMs: number): Promise<boolean> {
    const redis = this.redisService.getClient();
    const result = await redis.set(key, value, 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async release(key: string, value: string): Promise<boolean> {
    const redis = this.redisService.getClient();
    const result = await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, value);
    return result === 1;
  }
}
