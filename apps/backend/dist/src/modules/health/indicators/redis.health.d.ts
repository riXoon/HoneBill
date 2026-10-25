import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { RedisService } from '../../../infra/redis/redis.service';
export declare class RedisHealthIndicator extends HealthIndicator {
    private readonly redisService;
    constructor(redisService: RedisService);
    pingCheck(key: string): Promise<HealthIndicatorResult>;
}
