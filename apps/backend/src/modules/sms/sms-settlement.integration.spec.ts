import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TextbeeService } from '../otp/textbee.service.js';
import { SettlementQueueModule } from '../engine/settlement-queue.module.js';
import { SettlementQueueService } from '../engine/settlement-queue.service.js';
import { SettlementProcessor } from '../engine/settlement.processor.js';
import { StellarTransactionManager } from '../engine/stellar-transaction-manager.service.js';
import { SettlementsService } from '../settlements/settlements.util.js';
import type { SettlementFinalizationService } from '../settlements/settlement-finalization.service.js';
import { buildOfflineSignatureXdr, decodeBase62 } from '../settlements/offline-voucher.util.js';
import { SETTLEMENT_JOB_NAME, SETTLEMENT_QUEUE_NAME, type SettlementJobData } from '../settlements/settlement-queue.constants.js';
import { SmsController } from './sms.controller.js';
import { SmsService } from './sms.service.js';

// Real application services, with in-memory queue/cache and mocked DB/RPC boundaries.
function fixture(amount = '1', toll = 5_000_000n) {
  const device = Keypair.random();
  const gateway = Keypair.random();
  const token = 'CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3';
  const contract = 'CACAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAINCW';
  const config = new ConfigService({ TEXTBEE_WEBHOOK_SECRET: 'webhook-secret', RELAYER_PUBLIC_KEY: gateway.publicKey(), RELAYER_SECRET_KEY: gateway.secret(), CONTRACT_ID: contract });
  const nonce = Buffer.alloc(32, 0xfb);
  const signature = device.sign(buildOfflineSignatureXdr({ amountStroops: decodeBase62(amount), tollStroops: toll, nonce, receiverShortId: 'def456', gatewayPublicKey: gateway.publicKey(), tokenContractId: token, contractAddress: contract }));
  const voucher = `1:abc123:def456:${amount}:${nonce.toString('base64')}:${signature.toString('base64')}`;
  const raw = Buffer.from(JSON.stringify({ event: 'MESSAGE_RECEIVED', data: { sender: '+639171234567', message: voucher } }));
  const cache = new Map<string, string>();
  const client = {
    eval: jest.fn<(...args: any[]) => Promise<number>>().mockResolvedValue(1),
    get: jest.fn(async (key: string) => cache.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, ..._args: unknown[]) => {
      if (cache.has(key)) return null;
      cache.set(key, value);
      return 'OK';
    }),
  };
  const redis = { getClient: () => client };
  const jobs = new Map<string, Job<SettlementJobData>>();
  const add = jest.fn(async (name: string, data: SettlementJobData, opts: any) => {
    // Models BullMQ's atomic add-by-job-ID behavior; not a Redis integration test.
    if (!jobs.has(opts.jobId)) jobs.set(opts.jobId, { id: opts.jobId, name, data, opts } as Job<SettlementJobData>);
    return jobs.get(opts.jobId)!;
  });
  const producer = new SettlementQueueService({ add } as unknown as Queue);
  const textbee = { deliver: jest.fn() };
  const sms = new SmsService(textbee as unknown as TextbeeService, redis as unknown as RedisService, config, undefined, producer);
  const prisma = {
    settlement: {
      findUnique: jest.fn(async ({ where }: any) => where.recoveryLease
        ? { txHash: null, signedTxXdr: null, recoveryReview: null }
        : null),
      create: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: 1, status: 'PENDING' }),
      update: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({}),
      updateMany: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 1 }),
    },
    account: { findUnique: jest.fn(async ({ where }: any) => where.shortId === 'abc123' ? { stellarPublicKey: device.publicKey(), offlineDeviceKey: device.publicKey() } : { stellarPublicKey: Keypair.random().publicKey() }) },
    token: { findUnique: jest.fn(async () => ({ id: 1, symbol: 'PHPC', contractId: token, isActive: true })) },
  };
  const manager = { executeTwoPhaseSettlement: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ txHash: 'confirmed', pollResult: { status: 'SUCCESS' } }) };
  const finalization = {
    claim: jest.fn(async (id: number) => ({ id, token: 'fixture-lease' })),
    check: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ finalized: true, evidence: { status: 'SETTLED', txHash: 'confirmed' } }),
    release: jest.fn(async () => undefined),
  };
  const settlements = new SettlementsService(prisma as unknown as PrismaService, config, manager as unknown as StellarTransactionManager,
    finalization as unknown as SettlementFinalizationService);
  const worker = new SettlementProcessor(settlements);
  return { config, raw, voucher, client, redis, jobs, add, producer, textbee, sms, prisma, manager, worker, finalization };
}

describe('SMS to settlement integration', () => {
  let app: INestApplication | undefined;
  afterEach(async () => { await app?.close(); app = undefined; });

  it('routes a signed webhook through the shared module producer into the real worker and signature verification', async () => {
    const f = fixture('5SNuQC', 30_000_000n); // ₱500.01, signed with the ₱3.00 tier.
    const moduleRef = await Test.createTestingModule({
      imports: [SettlementQueueModule.register('bullmq')],
      controllers: [SmsController],
      providers: [SmsService, { provide: ConfigService, useValue: f.config }, { provide: RedisService, useValue: f.redis }, { provide: TextbeeService, useValue: f.textbee }],
    }).overrideProvider(getQueueToken(SETTLEMENT_QUEUE_NAME)).useValue({ add: f.add }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v2');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    await request(app.getHttpServer()).post('/api/v2/sms/webhook').type('application/json')
      .set('x-signature', createHmac('sha256', 'webhook-secret').update(f.raw).digest('hex')).send(f.raw.toString())
      .expect(200).expect(({ body }) => expect(body.status).toBe('Buffered'));
    const job = [...f.jobs.values()][0];
    expect(job.name).toBe(SETTLEMENT_JOB_NAME);
    expect(job.data).toMatchObject({ smsBody: f.voucher, senderPhone: '+639171234567', traceId: expect.any(String) });
    expect(job.opts).toMatchObject({ attempts: 5, backoff: { type: 'exponential', delay: 2000 } });
    await expect(f.worker.process(job)).resolves.toEqual({ txHash: 'confirmed', status: 'SETTLED' });
    expect(f.manager.executeTwoPhaseSettlement).toHaveBeenCalledTimes(1);
    expect(f.manager.executeTwoPhaseSettlement).toHaveBeenCalledWith(expect.objectContaining({
      args: expect.objectContaining({ amount: 5_000_100_000n, protocol_toll: 30_000_000n }),
    }));
    expect(f.finalization.check).toHaveBeenCalledWith({ id: 1, token: 'fixture-lease' }, true, expect.any(Number));
  });

  it('allows the same voucher to retry after a failed publish', async () => {
    const f = fixture();
    f.add.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(f.sms.processWebhook(f.raw, 'first')).rejects.toMatchObject({ status: 500 });
    expect(f.client.set).not.toHaveBeenCalled();
    await expect(f.sms.processWebhook(f.raw, 'retry')).resolves.toMatchObject({ status: 'Buffered' });
    await expect(f.sms.processWebhook(f.raw, 'duplicate')).resolves.toMatchObject({ status: 'Duplicate Replay' });
    expect(f.jobs.size).toBe(1);
    expect(f.add).toHaveBeenCalledTimes(2);
  });

  it('rejects a voucher signed with a fee outside the accepted schedules', async () => {
    const f = fixture('5SNuQC', 15_000_000n);
    await f.sms.processWebhook(f.raw, 'trace');
    const job = [...f.jobs.values()][0];
    await expect(f.worker.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(f.manager.executeTwoPhaseSettlement).not.toHaveBeenCalled();
    expect(f.prisma.settlement.create).not.toHaveBeenCalled();
  });

  it('converges concurrent duplicate requests on one durable job', async () => {
    const f = fixture();
    const results = await Promise.all([f.sms.processWebhook(f.raw, 'a'), f.sms.processWebhook(f.raw, 'b')]);
    expect(results.map((r) => r.status).sort()).toEqual(['Buffered', 'Duplicate Replay']);
    expect(f.jobs.size).toBe(1);
    expect(f.add).toHaveBeenCalledTimes(2);
  });

  it('deduplicates equivalent padded and URL-safe nonce encodings', async () => {
    const f = fixture();
    const alternative = f.voucher.replace(Buffer.alloc(32, 0xfb).toString('base64'), Buffer.alloc(32, 0xfb).toString('base64url'));
    await f.producer.enqueue(f.voucher);
    await f.producer.enqueue(alternative);
    expect(f.jobs.size).toBe(1);
  });

  it('retries an ambiguously acknowledged publish without adding another job', async () => {
    const f = fixture();
    const normalAdd = f.add.getMockImplementation()!;
    f.add.mockImplementationOnce(async (...args) => { await normalAdd(...args); throw new Error('connection lost after publish'); });
    await expect(f.sms.processWebhook(f.raw, 'first')).rejects.toMatchObject({ status: 500 });
    await expect(f.sms.processWebhook(f.raw, 'retry')).resolves.toMatchObject({ status: 'Buffered' });
    expect(f.jobs.size).toBe(1);
  });

  it('keeps durable buffering available when the nonce cache fails', async () => {
    const f = fixture();
    f.client.get.mockRejectedValue(new Error('cache read unavailable'));
    f.client.set.mockRejectedValue(new Error('cache write unavailable'));
    await expect(f.sms.processWebhook(f.raw, 'first')).resolves.toMatchObject({ status: 'Buffered' });
    await expect(f.sms.processWebhook(f.raw, 'retry')).resolves.toMatchObject({ status: 'Buffered' });
    expect(f.jobs.size).toBe(1);
  });

  it('does not reserve a nonce when settlement queues are disabled', async () => {
    const f = fixture();
    const sms = new SmsService(f.textbee as unknown as TextbeeService, f.redis as unknown as RedisService, f.config);
    await expect(sms.processWebhook(f.raw, 'disabled')).rejects.toMatchObject({ status: 500 });
    expect(f.client.set).not.toHaveBeenCalled();
  });

  it('leaves transient errors retryable under the producer retry policy', async () => {
    const f = fixture();
    await f.sms.processWebhook(f.raw, 'trace');
    const job = [...f.jobs.values()][0];
    const failure = new Error('network error');
    f.manager.executeTwoPhaseSettlement.mockRejectedValueOnce(failure);
    await expect(f.worker.process(job)).rejects.toMatchObject({ status: 503 });
    expect(job.opts.attempts).toBe(5);
    await expect(f.worker.process(job)).resolves.toMatchObject({ status: 'SETTLED' });
  });

  it('stops permanent signature errors with UnrecoverableError', async () => {
    const f = fixture();
    const invalid = f.voucher.replace(/[^:]+$/, Buffer.alloc(64).toString('base64'));
    await f.producer.enqueue(invalid);
    await expect(f.worker.process([...f.jobs.values()][0])).rejects.toBeInstanceOf(UnrecoverableError);
    expect(f.manager.executeTwoPhaseSettlement).not.toHaveBeenCalled();
  });

  it('stops unsupported job names and malformed worker payloads', async () => {
    const f = fixture();
    await expect(f.worker.process({ name: 'wrong', data: { smsBody: f.voucher } } as Job<SettlementJobData>)).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(f.worker.process({ name: SETTLEMENT_JOB_NAME, data: {} } as Job<SettlementJobData>)).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
