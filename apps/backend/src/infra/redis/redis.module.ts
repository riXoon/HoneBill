import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { OtpRateLimitService } from './otp-rate-limit.service';

@Global()
@Module({
  providers: [RedisService, OtpRateLimitService],
  exports: [RedisService, OtpRateLimitService],
})
export class RedisModule {}
