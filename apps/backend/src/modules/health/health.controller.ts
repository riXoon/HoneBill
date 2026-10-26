import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StellarRpcHealthIndicator } from './indicators/stellar-rpc.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly stellarRpc: StellarRpcHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => this.database.pingCheck('database'),
      async () => this.redis.pingCheck('redis'),
      async () => this.stellarRpc.pingCheck('sorobanRpc'),
    ]);
  }
}
