import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Controller, Get, INestApplication, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { LockService } from '../../src/infra/lock/lock.service.js';
import { RedisService } from '../../src/infra/redis/redis.service.js';
import { isRetryableSettlementError } from '../../src/modules/engine/engine-retry.util.js';

@Controller('test/stellar-infra')
class StellarInfraHarnessController {
  constructor(private readonly locks: LockService) {}

  @Get('lock/acquire')
  async acquire(
    @Query('key') key: string,
    @Query('owner') owner: string,
  ): Promise<{ acquired: boolean }> {
    return { acquired: await this.locks.acquire(key, owner, 10_000) };
  }

  @Get('lock/release')
  async release(
    @Query('key') key: string,
    @Query('owner') owner: string,
  ): Promise<{ released: boolean }> {
    return { released: await this.locks.release(key, owner) };
  }

  @Get('retry')
  retry(@Query('message') message: string): { retryable: boolean } {
    return { retryable: isRetryableSettlementError(new Error(message)) };
  }
}

describe('Stellar infrastructure request flow (e2e)', () => {
  let app: INestApplication;
  const entries = new Map<string, string>();
  const redis = {
    set: async (key: string, value: string) => {
      if (entries.has(key)) return null;
      entries.set(key, value);
      return 'OK';
    },
    eval: async (_script: string, _keyCount: number, key: string, owner: string) => {
      if (entries.get(key) !== owner) return 0;
      entries.delete(key);
      return 1;
    },
  } as unknown as Redis;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StellarInfraHarnessController],
      providers: [
        LockService,
        { provide: RedisService, useValue: { getClient: () => redis } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => app.close());

  it('enforces lock ownership across HTTP requests', async () => {
    const url = '/api/test/stellar-infra/lock';
    await request(app.getHttpServer())
      .get(`${url}/acquire`).query({ key: 'relayer', owner: 'worker-a' })
      .expect(200, { acquired: true });
    await request(app.getHttpServer())
      .get(`${url}/acquire`).query({ key: 'relayer', owner: 'worker-b' })
      .expect(200, { acquired: false });
    await request(app.getHttpServer())
      .get(`${url}/release`).query({ key: 'relayer', owner: 'worker-b' })
      .expect(200, { released: false });
    await request(app.getHttpServer())
      .get(`${url}/release`).query({ key: 'relayer', owner: 'worker-a' })
      .expect(200, { released: true });
  });

  it('returns retry decisions through the Nest HTTP request path', async () => {
    await request(app.getHttpServer())
      .get('/api/test/stellar-infra/retry')
      .query({ message: 'RPC request failed with status: 503' })
      .expect(200, { retryable: true });
    await request(app.getHttpServer())
      .get('/api/test/stellar-infra/retry')
      .query({ message: 'HostError: Error(Contract, 6)' })
      .expect(200, { retryable: false });
  });
});
