import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../infra/redis/redis.service.js';
import { OtpRateLimitService } from '../../infra/redis/otp-rate-limit.service.js';
import { TextbeeService } from './textbee.service.js';
export declare class OtpService {
    private readonly textbee;
    private readonly redisService;
    private readonly configService;
    private readonly rateLimiter;
    constructor(textbee: TextbeeService, redisService: RedisService, configService: ConfigService, rateLimiter: OtpRateLimitService);
    send(phoneNumber: string, clientIp: string): Promise<{
        success: boolean;
        message: string;
    }>;
    verify(phoneNumber: string, code: string): Promise<{
        verificationToken?: string | undefined;
        expiresIn?: number | undefined;
        success: boolean;
        message: string;
    }>;
    private getOtpEnvironment;
    private isOtpTokenRequired;
}
