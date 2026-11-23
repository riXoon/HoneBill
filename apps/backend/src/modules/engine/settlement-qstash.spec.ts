import { describe, expect, it, jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { QStashSettlementPublisher, type QStashPublishRequest } from './qstash-settlement.publisher.js';
import { QStashSignatureGuard, SettlementQStashController } from './settlement-qstash.controller.js';
import { resolveSettlementTransport } from './settlement-transport.js';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { SettlementQueueModule } from './settlement-queue.module.js';
import { SettlementPublisher } from './settlement-publisher.js';
import { SettlementQueueService } from './settlement-queue.service.js';

const CURRENT_KEY = 'sig_current_test_key';
const NEXT_KEY = 'sig_next_test_key';
const NONCE = Buffer.alloc(32, 7).toString('base64');
const VOUCHER = ['1', 'EMtVZn', 'vQGiB9', '1Hc', NONCE, Buffer.alloc(64, 1).toString('base64')].join(':');

const config = (values: Record<string, string | undefined>) => ({ get: (key: string) => values[key] }) as any;

/** The same token QStash puts in `Upstash-Signature`: HS256 JWT whose `body` claim is the body's SHA-256 (base64url). */
async function qstashSignature(body: string, key = CURRENT_KEY): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ body: createHash('sha256').update(body).digest('base64url') })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('Upstash')
    .setSubject('https://honebill.app/api/v2/settlements/qstash')
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 300)
    .setJti(`jwt_${now}`)
    .sign(new TextEncoder().encode(key));
}

function guardContext(headers: Record<string, string>, rawBody?: string) {
  const request = { header: (name: string) => headers[name.toLowerCase()], rawBody: rawBody === undefined ? undefined : Buffer.from(rawBody) };
  return { switchToHttp: () => ({ getRequest: () => request }) } as any;
}

describe('resolveSettlementTransport', () => {
  it('uses QStash when chosen, and keeps BullMQ as the default with queues on', () => {
    expect(resolveSettlementTransport({ SETTLEMENT_TRANSPORT: 'qstash' })).toBe('qstash');
    expect(resolveSettlementTransport({ SETTLEMENT_TRANSPORT: 'QStash ', QUEUE_ENABLED: 'true' })).toBe('qstash');
    expect(resolveSettlementTransport({ QUEUE_ENABLED: 'true' })).toBe('bullmq');
    expect(resolveSettlementTransport({ SETTLEMENT_TRANSPORT: 'bullmq', QUEUE_ENABLED: 'true' })).toBe('bullmq');
    expect(resolveSettlementTransport({ SETTLEMENT_TRANSPORT: 'bullmq' })).toBe('none');
    expect(resolveSettlementTransport({})).toBe('none');
    // A value pasted into a hosting dashboard with its quotes still counts.
    expect(resolveSettlementTransport({ SETTLEMENT_TRANSPORT: '"qstash"', QUEUE_ENABLED: 'true' })).toBe('qstash');
    expect(resolveSettlementTransport({ SETTLEMENT_TRANSPORT: "'qstash' " })).toBe('qstash');
  });
});

describe('QStashSettlementPublisher', () => {
  class TestPublisher extends QStashSettlementPublisher {
    sent: QStashPublishRequest[] = [];
    protected override async publish(request: QStashPublishRequest) {
      this.sent.push(request);
      return 'msg_123';
    }
  }

  it('publishes the voucher to the settlement route, deduplicated by its nonce', async () => {
    const publisher = new TestPublisher(config({ QSTASH_TOKEN: 't', NEXT_PUBLIC_APP_URL: 'https://honebill.app/' }));
    await expect(publisher.enqueue(VOUCHER, { senderPhone: '+639170000000', traceId: 'tr' })).resolves.toEqual({ jobId: 'msg_123' });
    const [sent] = publisher.sent;
    expect(sent.url).toBe('https://honebill.app/api/v2/settlements/qstash');
    expect(sent.body).toEqual({ senderPhone: '+639170000000', traceId: 'tr', smsBody: VOUCHER });
    // Same ID the BullMQ transport uses for this voucher: SHA-256 of the nonce's bytes.
    expect(sent.deduplicationId).toBe(`settlement-${createHash('sha256').update(Buffer.alloc(32, 7)).digest('hex')}`);
    expect(sent.retries).toBe(3);
  });

  it('reads URLs and the retry count pasted with quotes', async () => {
    const publisher = new TestPublisher(config({ QSTASH_SETTLEMENT_URL: '"https://x.test/hook"', QSTASH_SETTLEMENT_RETRIES: '"2"' }));
    await publisher.enqueue(VOUCHER);
    expect(publisher.sent[0]).toMatchObject({ url: 'https://x.test/hook', retries: 2 });
  });

  it('prefers QSTASH_SETTLEMENT_URL and the configured retry count', async () => {
    const publisher = new TestPublisher(config({ QSTASH_SETTLEMENT_URL: 'https://x.test/hook', QSTASH_SETTLEMENT_RETRIES: '5' }));
    await publisher.enqueue(VOUCHER);
    expect(publisher.sent[0]).toMatchObject({ url: 'https://x.test/hook', retries: 5 });
  });

  it('refuses a malformed voucher and a missing callback URL before calling QStash', async () => {
    const publisher = new TestPublisher(config({}));
    await expect(publisher.enqueue('not-a-voucher')).rejects.toThrow();
    await expect(publisher.enqueue(VOUCHER)).rejects.toThrow('QStash settlement URL is not configured');
    expect(publisher.sent).toHaveLength(0);
  });
});

describe('QStashSignatureGuard', () => {
  const guard = new QStashSignatureGuard(config({ QSTASH_CURRENT_SIGNING_KEY: CURRENT_KEY, QSTASH_NEXT_SIGNING_KEY: NEXT_KEY }));
  const body = JSON.stringify({ smsBody: VOUCHER });

  it('accepts a delivery signed by QStash with the current or the next key', async () => {
    await expect(guard.canActivate(guardContext({ 'upstash-signature': await qstashSignature(body) }, body))).resolves.toBe(true);
    await expect(guard.canActivate(guardContext({ 'upstash-signature': await qstashSignature(body, NEXT_KEY) }, body))).resolves.toBe(true);
  });

  it('rejects a missing signature, a wrong key and a changed body', async () => {
    await expect(guard.canActivate(guardContext({}, body))).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(guardContext({ 'upstash-signature': await qstashSignature(body, 'wrong') }, body))).rejects.toThrow(UnauthorizedException);
    const signed = await qstashSignature(body);
    await expect(guard.canActivate(guardContext({ 'upstash-signature': signed }, body.replace('EMtVZn', 'xxxxxx')))).rejects.toThrow(UnauthorizedException);
  });

  it('accepts signing keys pasted with quotes around them', async () => {
    const quoted = new QStashSignatureGuard(config({ QSTASH_CURRENT_SIGNING_KEY: `"${CURRENT_KEY}"`, QSTASH_NEXT_SIGNING_KEY: ` '${NEXT_KEY}' ` }));
    await expect(quoted.canActivate(guardContext({ 'upstash-signature': await qstashSignature(body) }, body))).resolves.toBe(true);
  });

  it('rejects everything when the signing keys are not configured', async () => {
    const open = new QStashSignatureGuard(config({}));
    await expect(open.canActivate(guardContext({ 'upstash-signature': await qstashSignature(body) }, body))).rejects.toThrow(UnauthorizedException);
  });
});

describe('SettlementQStashController', () => {
  const controllerWith = (processSettlement: (body: string) => Promise<unknown>) =>
    new SettlementQStashController({ processSettlement } as any);
  const request = (body: unknown) => ({ body }) as any;

  it('answers processed once the voucher settles', async () => {
    const settle = jest.fn(async (_body: string, _relayPhone?: string) => ({ status: 'SETTLED', txHash: 'h' }));
    await expect(controllerWith(settle).process(request({ smsBody: VOUCHER, senderPhone: '+639000000001' }), 'msg_1')).resolves.toEqual({
      status: 'processed',
      result: { status: 'SETTLED', txHash: 'h' },
    });
    expect(settle).toHaveBeenCalledWith(VOUCHER, '+639000000001');
  });

  it('answers rejected (so QStash stops) when the voucher can never settle', async () => {
    const controller = controllerWith(async () => {
      throw new UnauthorizedException();
    });
    await expect(controller.process(request({ smsBody: VOUCHER }), 'msg_2')).resolves.toEqual({ status: 'rejected', reason: 'Unauthorized' });
    await expect(controller.process(request({}), 'msg_3')).resolves.toMatchObject({ status: 'rejected' });
  });

  it('answers 503 (so QStash retries) on a temporary failure', async () => {
    const controller = controllerWith(async () => {
      throw new Error('Settlement transaction abc is not confirmed yet (timeout)');
    });
    const error: any = await controller.process(request({ smsBody: VOUCHER }), 'msg_4', '1').catch((e) => e);
    expect(error).toBeInstanceOf(ApiResponseException);
    expect(error.getStatus()).toBe(503);
  });

  it('treats an UnrecoverableError from the runner as final', async () => {
    const controller = controllerWith(async () => {
      throw new UnrecoverableError('bad');
    });
    await expect(controller.process(request({ smsBody: VOUCHER }))).resolves.toMatchObject({ status: 'rejected' });
  });
});

describe('SettlementQueueModule wiring', () => {
  it('gives the SMS webhook the QStash publisher when the transport is qstash, and BullMQ otherwise', async () => {
    const qstash = await Test.createTestingModule({
      // As in AppModule, config is global, so the transport's module can read it.
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), SettlementQueueModule.register('qstash')],
    }).compile();
    expect(qstash.get(SettlementPublisher)).toBeInstanceOf(QStashSettlementPublisher);

    const bullmq = await Test.createTestingModule({ imports: [SettlementQueueModule.register('bullmq')] })
      .overrideProvider(getQueueToken('engine-settlement')).useValue({ add: jest.fn() })
      .compile();
    expect(bullmq.get(SettlementPublisher)).toBeInstanceOf(SettlementQueueService);
  });
});
