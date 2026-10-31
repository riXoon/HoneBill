import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { parseSettlementSmsBody } from '../settlements/settlements.util.js';

export const ENGINE_SETTLEMENT_QUEUE = 'engine-settlement';
export const ENGINE_SETTLEMENT_JOB = 'process-offline-voucher';

@Injectable()
export class SettlementQueueService {
  constructor(@InjectQueue(ENGINE_SETTLEMENT_QUEUE) private readonly queue: Queue) {}

  async enqueue(smsBody: string): Promise<{ jobId: string }> {
    // Validate and canonicalize the idempotency key before storing an untrusted job.
    const { nonce } = parseSettlementSmsBody(smsBody);
    const jobId = `settlement-${createHash('sha256').update(nonce).digest('hex')}`;
    const job = await this.queue.add(
      ENGINE_SETTLEMENT_JOB,
      { smsBody },
      {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 500 },
        removeOnFail: false,
      },
    );
    return { jobId: job.id ?? jobId };
  }
}
