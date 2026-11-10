import { Logger } from '@nestjs/common';
import { UnrecoverableError, type Job } from 'bullmq';
import { SettlementsService } from '../settlements/settlements.util.js';
import { SmsService } from '../sms/sms.service.js';
import { normalizeSettlementFailure, isRetryableSettlementError } from './engine-retry.util.js';
import { ENGINE_SETTLEMENT_JOB } from './settlement-queue.service.js';
import type { SettlementJobData } from '../settlements/settlement-queue.constants.js';

/**
 * Settles one queued offline voucher. It is the whole job, kept apart from BullMQ's worker so it runs the same way
 * whether a long-lived worker (`SettlementProcessor`) or an on-demand drain inside a serverless request
 * (`SettlementDrainService`) picked the job up.
 */
export class SettlementJobRunner {
  private readonly logger = new Logger(SettlementJobRunner.name);

  constructor(
    private readonly settlements: SettlementsService,
    private readonly sms?: SmsService,
  ) {}

  /** Validates and processes one voucher job, retries transient failures, and queues a deduplicated receipt after settlement. */
  async run(job: Job<SettlementJobData>) {
    if (job.name !== ENGINE_SETTLEMENT_JOB) {
      throw new UnrecoverableError(`Unsupported settlement job: ${job.name}`);
    }
    if (typeof job.data?.smsBody !== 'string' || job.data.smsBody.length === 0) {
      throw new UnrecoverableError('Settlement job is missing smsBody');
    }

    try {
      const result = await this.settlements.processSettlement(job.data.smsBody);
      if (result.status === 'PENDING') {
        throw new Error(`Settlement ${result.txHash ?? ''} has not been confirmed (timeout)`);
      }
      if (result.status === 'SETTLED' && job.data.senderPhone && this.sms) {
        const reference = result.txHash ? result.txHash.slice(0, 8) : 'confirmed';
        try {
          const notification = await this.sms.enqueueSms(
            job.data.senderPhone,
            `HoneBill: Your offline transaction was processed. Ref: ${reference}`,
            {
              traceId: job.data.traceId,
              dedupKey: `settlement-receipt:${job.id}:sender`,
            },
          );
          if (!notification.queued && !notification.delivered) {
            this.logger.warn(`Settlement receipt could not be queued or delivered for job ${job.id}`);
          }
        } catch (notificationError) {
          const reason = normalizeSettlementFailure(notificationError);
          this.logger.warn(`Settlement succeeded but receipt enqueue failed for job ${job.id}: ${reason}`);
        }
      }
      return result;
    } catch (error) {
      if (!isRetryableSettlementError(error)) {
        const reason = normalizeSettlementFailure(error);
        this.logger.warn(`Settlement job ${job.id} will not retry: ${reason}`);
        throw new UnrecoverableError(reason);
      }
      throw error;
    }
  }
}
