import { CanActivate, ExecutionContext } from '@nestjs/common';
import { OtpRateLimitService } from '../../infra/redis/otp-rate-limit.service.js';
export declare class PinVerifyRateLimitGuard implements CanActivate {
    private readonly limiter;
    constructor(limiter: OtpRateLimitService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
