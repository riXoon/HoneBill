import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StellarRpcHealthIndicator } from './indicators/stellar-rpc.health';
import { SmsHealthService } from './sms-health.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    DatabaseHealthIndicator,
    RedisHealthIndicator,
    StellarRpcHealthIndicator,
    SmsHealthService,
  ],
})
export class HealthModule {}
