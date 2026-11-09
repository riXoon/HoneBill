import { Injectable, Logger, Optional } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { SettlementsService } from '../settlements/settlements.util.js';
import { SmsService } from '../sms/sms.service.js';
import { normalizeSettlementFailure, isRetryableSettlementError } from './engine-retry.util.js';
import { ENGINE_SETTLEMENT_JOB, ENGINE_SETTLEMENT_QUEUE } from './settlement-queue.service.js';
import type { SettlementJobData } from '../settlements/settlement-queue.constants.js';

@Processor(ENGINE_SETTLEMENT_QUEUE)
@Injectable()
export class SettlementProcessor extends WorkerHost {
  private readonly logger = new Logger(SettlementProcessor.name);

  /** Creates the worker with settlement processing and optional SMS receipt delivery. */
  constructor(
    private readonly settlements: SettlementsService,
    @Optional() private readonly sms?: SmsService,
  ) {
    super();
  }

  /** Validates and processes one voucher job, retries transient failures, and queues a deduplicated receipt after settlement. */
  async process(job: Job<SettlementJobData>) {
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
