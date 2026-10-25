import { RedisService } from '../redis/redis.service';
export declare class LockService {
    private readonly redisService;
    constructor(redisService: RedisService);
    acquire(key: string, value: string, ttlMs: number): Promise<boolean>;
    release(key: string, value: string): Promise<boolean>;
}
