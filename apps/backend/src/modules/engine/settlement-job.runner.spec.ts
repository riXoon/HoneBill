import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { SettlementJobRunner } from './settlement-job.runner.js';
import { ENGINE_SETTLEMENT_JOB } from './settlement-queue.service.js';
import type { VoucherNotice } from './settlement-notice.util.js';

const notice: VoucherNotice = {
  nonce: 'QUJDREVGRw==',
  senderShortId: 'abc123',
  receiverShortId: 'def456',
  amountStroops: 1_000_000_000n,
  symbol: 'PHPC',
  decimals: 7,
  receiverPhone: '+639170000002',
  senderName: 'Ana',
};

const job = { id: '7', name: ENGINE_SETTLEMENT_JOB, data: { smsBody: 'voucher', senderPhone: '+639170000001', traceId: 't' } };

function makeRunner(processSettlement: () => Promise<any>) {
  const settlements = {
    processSettlement: jest.fn(processSettlement),
    describeVoucher: jest.fn(async () => notice),
  };
  const sms = { enqueueSms: jest.fn(async (..._args: any[]) => ({ queued: true, messageId: '1' })) };
  const runner = new SettlementJobRunner(settlements as any, sms as any);
  const texts = () => sms.enqueueSms.mock.calls.map(([to, message, options]) => ({ to, message, dedupKey: (options as any).dedupKey }));
  return { runner, sms, texts };
}

describe('SettlementJobRunner texts', () => {
  it('tells the sender and the receiver when the payment goes through', async () => {
    const { runner, texts } = makeRunner(async () => ({ status: 'SETTLED', txHash: 'h' }));
    await expect(runner.run(job)).resolves.toEqual({ status: 'SETTLED', txHash: 'h' });
    expect(texts()).toEqual([
      {
        to: '+639170000001',
        message: 'HoneBill: Your offline payment of PHP 100.00 to ID def456 went through. Ref: QUJDRE',
        dedupKey: 'settlement-receipt:QUJDREVGRw==:sender',
      },
      {
        to: '+639170000002',
        message: 'HoneBill: You received PHP 100.00 from Ana (ID abc123). Ref: QUJDRE',
        dedupKey: 'settlement-receipt:QUJDREVGRw==:receiver',
      },
    ]);
  });

  it('still confirms to the sender when the app settled the voucher first', async () => {
    const { runner, texts } = makeRunner(async () => {
      throw new ApiResponseException(409, { txHash: 'h', status: 'SETTLED' });
    });
    await expect(runner.run(job)).resolves.toEqual({ status: 'SETTLED', txHash: 'h' });
    expect(texts()[0].message).toContain('went through');
  });

  it('tells the sender why a payment cannot settle, and that no money was taken', async () => {
    const { runner, texts } = makeRunner(async () => {
      throw new NotFoundException('Recipient account not found');
    });
    await expect(runner.run(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(texts()).toEqual([
      {
        to: '+639170000001',
        message:
          'HoneBill: Your offline payment of PHP 100.00 to ID def456 did not go through. No account has this ID. Check the ID (capital and small letters matter). No money was taken. Ref: QUJDRE',
        dedupKey: 'settlement-failed:QUJDREVGRw==:sender',
      },
    ]);
  });

  it('tells the sender when the ledger rejects the payment', async () => {
    const { runner, texts } = makeRunner(async () => ({ status: 'FAILED', txHash: 'h' }));
    await expect(runner.run(job)).resolves.toEqual({ status: 'FAILED', txHash: 'h' });
    expect(texts()).toHaveLength(1);
    expect(texts()[0].message).toContain('did not go through');
  });

  it('says why when the ledger rejects the payment with a known reason', async () => {
    const { runner, texts } = makeRunner(async () => ({
      status: 'FAILED',
      txHash: 'h',
      reason: 'Your Offline balance was not enough for the amount plus the PHP 0.50 fee.',
    }));
    await runner.run(job);
    expect(texts()[0].message).toContain('Offline balance was not enough');
  });

  it('repeats the stored reason when the voucher had already failed', async () => {
    const { runner, texts } = makeRunner(async () => {
      throw new ApiResponseException(409, {
        txHash: null,
        status: 'FAILED',
        reason: 'This payment was already used once, so it cannot be used again.',
      });
    });
    await expect(runner.run(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(texts()[0].message).toContain('already used once');
  });

  it('sends nothing for a failure that will be retried', async () => {
    const { runner, sms } = makeRunner(async () => {
      throw new Error('fetch failed');
    });
    await expect(runner.run(job)).rejects.toThrow('fetch failed');
    expect(sms.enqueueSms).not.toHaveBeenCalled();
  });

  it('does not text the receiver when the same number sent the voucher', async () => {
    const { runner, texts } = makeRunner(async () => ({ status: 'SETTLED', txHash: 'h' }));
    await runner.run({ ...job, data: { ...job.data, senderPhone: notice.receiverPhone! } });
    expect(texts()).toHaveLength(1);
  });
});
