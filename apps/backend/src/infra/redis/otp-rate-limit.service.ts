import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../../infra/redis/redis.service.js';

export class RateLimitedException extends HttpException {
  constructor(message: string, readonly retryAfterSeconds: number) {
    super({ error: message }, 429);
  }
}

const SLIDING = `
local now, window, limit = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
if redis.call('ZCARD', KEYS[1]) >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return tonumber(oldest[2]) + window - now
end
redis.call('ZADD', KEYS[1], now, ARGV[4])
redis.call('PEXPIRE', KEYS[1], window)
return 0
`;

@Injectable()
export class OtpRateLimitService {
  constructor(private readonly redis: RedisService, private readonly config: ConfigService) {}

  private async hit(key: string, limit: number, windowMs: number): Promise<number> {
    const now = Date.now();
    const wait = await this.redis.getClient().eval(
      SLIDING, 1, key, now, windowMs, limit, `${now}-${randomUUID()}`,
    );
    return Number(wait); // 0 = allowed, otherwise milliseconds to wait
  }

  async enforce(key: string, limit: number, windowMs: number): Promise<void> {
    const wait = await this.hit(key, limit, windowMs);
    if (wait > 0) {
      throw new RateLimitedException(
        'Too many requests. Please try again later.',
        Math.ceil(wait / 1000),
      );
    }
  }

  async enforceSendLimits(ip: string, phone: string) {
    const globalLimit = Number(this.config.get('OTP_GLOBAL_LIMIT_PER_HOUR') ?? 300);
    const checks: Array<[string, number, number]> = [
      [`honebill:api:otp:ratelimit:${ip}_${phone}`, 3, 5 * 60_000],
      [`honebill:api:otp:phone:${phone}`, 5, 60 * 60_000],
      [`honebill:api:otp:global:all`, globalLimit, 60 * 60_000],
    ];
    for (const [key, limit, windowMs] of checks) {
      const wait = await this.hit(key, limit, windowMs);
      if (wait > 0) {
        throw new RateLimitedException(
          'Too many OTP requests. Please wait a few minutes.',
          Math.ceil(wait / 1000),
        );
      }
    }
  }
}