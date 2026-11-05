import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DatabaseHealthIndicator } from '../../../../src/modules/health/indicators/database.health.js';
import { RedisHealthIndicator } from '../../../../src/modules/health/indicators/redis.health.js';
import { StellarRpcHealthIndicator } from '../../../../src/modules/health/indicators/stellar-rpc.health.js';
import { HealthController } from '../../../../src/modules/health/health.controller.js';

describe('HealthController legacy response contract', () => {
  const envKeys = [
    'OTP_TEST_MODE',
    'RAMP_ENABLED',
    'DEPOSIT_ENABLED',
    'WITHDRAW_ENABLED',
    'DEMO_ENABLED',
    'TEXTBEE_GATEWAY_URL',
    'TEXTBEE_DEVICE_ID',
    'TEXTBEE_API_KEY',
    'TEXTBEE_FALLBACK_GATEWAY_URL',
    'TEXTBEE_FALLBACK_DEVICE_ID',
    'TEXTBEE_FALLBACK_API_KEY',
  ];
  const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const database = { pingCheck: jest.fn<() => Promise<unknown>>() };
  const redis = { pingCheck: jest.fn<() => Promise<unknown>>() };
  const stellarRpc = { pingCheck: jest.fn<() => Promise<unknown>>() };

  const controller = new HealthController(
    database as unknown as DatabaseHealthIndicator,
    redis as unknown as RedisHealthIndicator,
    stellarRpc as unknown as StellarRpcHealthIndicator,
  );

  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    database.pingCheck.mockResolvedValue({});
    redis.pingCheck.mockResolvedValue({});
    stellarRpc.pingCheck.mockResolvedValue({});
  });

  afterEach(() => {
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('returns the legacy health envelope when all probes pass', async () => {
    const result = await controller.check();

    expect(result).toMatchObject({
      status: 'healthy',
      checks: { database: 'ok', redis: 'ok', sorobanRpc: 'ok' },
      features: {
        smsOtp: false,
        ramp: true,
        deposit: true,
        withdraw: true,
        demo: false,
      },
    });
    expect(typeof result.uptime).toBe('number');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('returns 200-compatible degraded data when a dependency probe fails', async () => {
    redis.pingCheck.mockRejectedValue(new Error('Redis is unavailable'));
    process.env.OTP_TEST_MODE = 'true';
    process.env.RAMP_ENABLED = 'false';
    process.env.DEPOSIT_ENABLED = 'true';
    process.env.WITHDRAW_ENABLED = 'false';
    process.env.DEMO_ENABLED = 'true';

    await expect(controller.check()).resolves.toMatchObject({
      status: 'degraded',
      checks: { database: 'ok', redis: 'error', sorobanRpc: 'ok' },
      features: {
        smsOtp: true,
        ramp: false,
        deposit: false,
        withdraw: false,
        demo: true,
      },
    });
  });
});
