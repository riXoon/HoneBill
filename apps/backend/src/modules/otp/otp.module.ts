import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module.js';
import { OtpRateLimitService } from '../../infra/redis/otp-rate-limit.service.js';
import { OtpController } from './otp.controller.js';
import { OtpService } from './otp.service.js';
import { TextbeeService } from './textbee.service.js';
import { PinVerifyRateLimitGuard } from '../../common/guards/pin-verify-rate-limit.guard.js';

@Module({
  imports: [RedisModule],
  controllers: [OtpController],
  providers: [OtpService, OtpRateLimitService, TextbeeService, PinVerifyRateLimitGuard],
  exports: [OtpService, TextbeeService],
})
export class OtpModule {}
