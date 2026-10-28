import { Controller, Get } from '@nestjs/common';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StellarRpcHealthIndicator } from './indicators/stellar-rpc.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly stellarRpc: StellarRpcHealthIndicator,
  ) {}

  @Get()
  async check() {
    const [databaseOk, redisOk, sorobanRpcOk] = await Promise.all([
      this.probe(() => this.database.pingCheck('database')),
      this.probe(() => this.redis.pingCheck('redis')),
      this.probe(() => this.stellarRpc.pingCheck('sorobanRpc')),
    ]);

    const ramp = process.env.RAMP_ENABLED !== 'false';
    const primarySms = Boolean(
      (process.env.TEXTBEE_GATEWAY_URL || process.env.TEXTBEE_DEVICE_ID) &&
        process.env.TEXTBEE_API_KEY,
    );
    const fallbackSms = Boolean(
      (process.env.TEXTBEE_FALLBACK_GATEWAY_URL || process.env.TEXTBEE_FALLBACK_DEVICE_ID) &&
        process.env.TEXTBEE_FALLBACK_API_KEY,
    );

    return {
      status: databaseOk && redisOk ? 'healthy' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseOk ? 'ok' : 'error',
        redis: redisOk ? 'ok' : 'error',
        sorobanRpc: sorobanRpcOk ? 'ok' : 'error',
      },
      features: {
        smsOtp: primarySms || fallbackSms || process.env.OTP_TEST_MODE === 'true',
        ramp,
        deposit: ramp && process.env.DEPOSIT_ENABLED !== 'false',
        withdraw: ramp && process.env.WITHDRAW_ENABLED !== 'false',
        demo: process.env.DEMO_ENABLED === 'true',
      },
    };
  }

  private async probe(run: () => Promise<unknown>): Promise<boolean> {
    try {
      await run();
      return true;
    } catch {
      return false;
    }
  }
}
