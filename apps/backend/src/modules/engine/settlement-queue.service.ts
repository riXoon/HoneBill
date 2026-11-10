import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { parseOfflineVoucher } from '../settlements/offline-voucher.util.js';
import { SETTLEMENT_JOB_NAME, SETTLEMENT_QUEUE_NAME, type SettlementJobData } from '../settlements/settlement-queue.constants.js';

export const ENGINE_SETTLEMENT_QUEUE = SETTLEMENT_QUEUE_NAME;
export const ENGINE_SETTLEMENT_JOB = SETTLEMENT_JOB_NAME;

let afterEnqueue: (() => void) | undefined;

@Injectable()
export class SettlementQueueService {
  constructor(@InjectQueue(ENGINE_SETTLEMENT_QUEUE) private readonly queue: Queue) {}

  /**
   * Registers what to do right after a voucher is queued (e.g. start a serverless drain). Replaces any earlier one.
   * Held at module level, not per instance, so it applies to whichever copy of this service the webhook was given.
   */
  onEnqueued(callback: () => void): void {
    afterEnqueue = callback;
  }

  async enqueue(smsBody: string, metadata: Pick<SettlementJobData, 'senderPhone' | 'traceId'> = {}): Promise<{ jobId: string }> {
    // Validate and canonicalize the idempotency key before storing an untrusted job.
    const { nonce } = parseOfflineVoucher(smsBody);
    const jobId = `settlement-${createHash('sha256').update(nonce).digest('hex')}`;
    const job = await this.queue.add(
      ENGINE_SETTLEMENT_JOB,
      { ...metadata, smsBody } satisfies SettlementJobData,
      {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 500 },
        removeOnFail: false,
      },
    );
    try {
      afterEnqueue?.();
    } catch {
      // Starting a drain is best effort: the job is queued either way, and the next drain picks it up.
    }
    return { jobId: job.id ?? jobId };
  }
}
