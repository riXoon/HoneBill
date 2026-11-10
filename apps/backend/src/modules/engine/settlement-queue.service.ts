import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SETTLEMENT_JOB_NAME, SETTLEMENT_QUEUE_NAME, type SettlementJobData } from '../settlements/settlement-queue.constants.js';
import { SettlementPublisher, settlementJobIdFor } from './settlement-publisher.js';

export const ENGINE_SETTLEMENT_QUEUE = SETTLEMENT_QUEUE_NAME;
export const ENGINE_SETTLEMENT_JOB = SETTLEMENT_JOB_NAME;

let afterEnqueue: (() => void) | undefined;

/** The BullMQ transport: adds each voucher to the Redis queue (SETTLEMENT_TRANSPORT=bullmq). */
@Injectable()
export class SettlementQueueService extends SettlementPublisher {
  constructor(@InjectQueue(ENGINE_SETTLEMENT_QUEUE) private readonly queue: Queue) {
    super();
  }

  /**
   * Registers what to do right after a voucher is queued (e.g. start a serverless drain). Replaces any earlier one.
   * Held at module level, not per instance, so it applies to whichever copy of this service the webhook was given.
   */
  onEnqueued(callback: () => void): void {
    afterEnqueue = callback;
  }

  async enqueue(smsBody: string, metadata: Pick<SettlementJobData, 'senderPhone' | 'traceId'> = {}): Promise<{ jobId: string }> {
    // Validate and canonicalize the idempotency key before storing an untrusted job.
    const jobId = settlementJobIdFor(smsBody);
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
