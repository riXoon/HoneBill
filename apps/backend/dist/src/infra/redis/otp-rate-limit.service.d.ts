import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../infra/redis/redis.service.js';
export declare class RateLimitedException extends HttpException {
    readonly retryAfterSeconds: number;
    constructor(message: string, retryAfterSeconds: number);
}
export declare class OtpRateLimitService {
    private readonly redis;
    private readonly config;
    constructor(redis: RedisService, config: ConfigService);
    private hit;
    enforce(key: string, limit: number, windowMs: number): Promise<void>;
    enforceSendLimits(ip: string, phone: string): Promise<void>;
}
