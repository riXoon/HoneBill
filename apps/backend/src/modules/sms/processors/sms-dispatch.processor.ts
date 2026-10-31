import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { TextbeeService } from '../../otp/textbee.service.js';
import { maskPhoneNumber } from '../sms-security.util.js';
import {
  SMS_QUEUE_CONCURRENCY,
  SMS_QUEUE_MAX_PER_MINUTE,
  SMS_QUEUE_NAME,
} from '../sms.constants.js';
import type { SmsJob } from '../sms.service.js';

/** Sends queued non-OTP receipts, one at a time and at the former QStash flow-control rate. */
@Processor(SMS_QUEUE_NAME, {
  concurrency: SMS_QUEUE_CONCURRENCY,
  limiter: { max: SMS_QUEUE_MAX_PER_MINUTE, duration: 60_000 },
})
export class SmsDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsDispatchProcessor.name);

  constructor(private readonly textbee: TextbeeService) {
    super();
  }

  /** Delivers one queue job; transient gateway errors throw so BullMQ applies its retry policy. */
  async process(job: Job<SmsJob>): Promise<{ success: true } | { success: false; error: string }> {
    const result = await this.textbee.deliver(job.data.to, job.data.message, {
      retries: 0,
      deadlineMs: 9000,
    });
    const trace = job.data.traceId ? ` traceId=${job.data.traceId}` : '';
    if (result.success) {
      this.logger.log(`Delivered SMS to ${maskPhoneNumber(job.data.to)} via ${result.gateway}${trace}`);
      return { success: true };
    }
    if (result.retryable) {
      this.logger.warn(`Transient SMS failure for ${maskPhoneNumber(job.data.to)}${trace}`);
      throw new Error('SMS delivery failed, will retry');
    }
    this.logger.error(`Permanent SMS failure for ${maskPhoneNumber(job.data.to)}${trace}`);
    return { success: false, error: 'Undeliverable' };
  }
}
