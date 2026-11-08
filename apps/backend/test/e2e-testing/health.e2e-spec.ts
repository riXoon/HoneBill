import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../../src/modules/health/health.controller.js';
import { DatabaseHealthIndicator } from '../../src/modules/health/indicators/database.health.js';
import { RedisHealthIndicator } from '../../src/modules/health/indicators/redis.health.js';
import { StellarRpcHealthIndicator } from '../../src/modules/health/indicators/stellar-rpc.health.js';
import { SmsHealthService } from '../../src/modules/health/sms-health.service.js';

describe('/api/v2/health legacy response contract (e2e)', () => {
  let app: INestApplication;
  const database = { pingCheck: jest.fn<(key: string) => Promise<unknown>>() };
  const redis = { pingCheck: jest.fn<(key: string) => Promise<unknown>>() };
  const stellarRpc = { pingCheck: jest.fn<(key: string) => Promise<unknown>>() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DatabaseHealthIndicator, useValue: database },
        { provide: RedisHealthIndicator, useValue: redis },
        { provide: StellarRpcHealthIndicator, useValue: stellarRpc },
        // Deep SMS device probing is outside these health-envelope tests.
        { provide: SmsHealthService, useValue: { getStatuses: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v2');
    await app.init();
  });

  beforeEach(() => {
    database.pingCheck.mockResolvedValue({});
    redis.pingCheck.mockResolvedValue({});
    stellarRpc.pingCheck.mockResolvedValue({});
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns HTTP 200 with the legacy health envelope when probes pass', async () => {
    const response = await request(app.getHttpServer()).get('/api/v2/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'healthy',
      checks: { database: 'ok', redis: 'ok', sorobanRpc: 'ok' },
      features: expect.objectContaining({
        smsOtp: expect.any(Boolean),
        ramp: expect.any(Boolean),
        deposit: expect.any(Boolean),
        withdraw: expect.any(Boolean),
        demo: expect.any(Boolean),
      }),
    });
    expect(response.body.uptime).toEqual(expect.any(Number));
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });

  it('keeps HTTP 200 and returns degraded legacy data when a probe fails', async () => {
    redis.pingCheck.mockRejectedValue(new Error('Redis is unavailable'));

    const response = await request(app.getHttpServer()).get('/api/v2/health').expect(200);

    expect(response.body.status).toBe('degraded');
    expect(response.body.checks).toEqual({
      database: 'ok',
      redis: 'error',
      sorobanRpc: 'ok',
    });
  });
});
