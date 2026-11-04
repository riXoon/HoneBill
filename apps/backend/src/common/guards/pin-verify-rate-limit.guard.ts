import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { OtpRateLimitService } from '../../infra/redis/otp-rate-limit.service.js';

@Injectable()
export class PinVerifyRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: OtpRateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    await this.limiter.enforce(`honebill:api:pin:verify:${req.ip ?? 'unknown'}`, 30, 60_000);
    return true;
  }
}