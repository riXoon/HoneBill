import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { SettlementsService } from '../settlements/settlements.util.js';
import { normalizeSettlementFailure, isRetryableSettlementError } from './engine-retry.util.js';
import { ENGINE_SETTLEMENT_JOB, ENGINE_SETTLEMENT_QUEUE } from './settlement-queue.service.js';

@Processor(ENGINE_SETTLEMENT_QUEUE)
@Injectable()
export class SettlementProcessor extends WorkerHost {
  private readonly logger = new Logger(SettlementProcessor.name);

  constructor(private readonly settlements: SettlementsService) {
    super();
  }

  async process(job: Job<{ smsBody?: unknown }>) {
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
