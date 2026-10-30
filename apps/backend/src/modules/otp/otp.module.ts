import { Module } from '@nestjs/common';
import { RedisModule } from '../../infra/redis/redis.module.js';
import { OtpRateLimitService } from '../../infra/redis/otp-rate-limit.service.js';
import { OtpController } from './otp.controller.js';
import { OtpService } from './otp.service.js';
import { TextbeeService } from './textbee.service.js';

@Module({
  imports: [RedisModule],
  controllers: [OtpController],
  providers: [OtpService, OtpRateLimitService, TextbeeService],
  exports: [OtpService],
})
export class OtpModule {}
