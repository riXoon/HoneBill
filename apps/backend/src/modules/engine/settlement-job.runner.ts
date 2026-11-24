import { HttpException, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { normalizePhoneNumber } from '../../common/utils/phone.util.js';
import { SettlementsService } from '../settlements/settlements.util.js';
import { SmsService } from '../sms/sms.service.js';
import { normalizeSettlementFailure, isRetryableSettlementError } from './engine-retry.util.js';
import { failedText, receivedText, settledText, userFailureReason, type VoucherNotice } from './settlement-notice.util.js';
import { ENGINE_SETTLEMENT_JOB } from './settlement-queue.service.js';
import type { SettlementJobData } from '../settlements/settlement-queue.constants.js';

/** What the runner needs from a job: BullMQ's Job has these, and the QStash route builds one from its request. */
export type SettlementJob = { id?: string; name: string; data: SettlementJobData };

/** `reason` is set on a FAILED result: why, in the sender's words. */
type SettlementResult = { txHash: string | null; status: string; reason?: string };

/**
 * The decided status a 409 carries: the voucher was settled (or failed) already, usually by the app over the internet.
 * A failed one carries the stored reason, so the text can repeat why.
 */
function decidedElsewhere(error: unknown): { status: 'SETTLED' | 'FAILED'; txHash: string | null; reason: string | null } | null {
  if (!(error instanceof ApiResponseException) || error.getStatus() !== 409) return null;
  const status = error.responseBody.status;
  if (status !== 'SETTLED' && status !== 'FAILED') return null;
  const txHash = typeof error.responseBody.txHash === 'string' ? error.responseBody.txHash : null;
  const reason = typeof error.responseBody.reason === 'string' ? error.responseBody.reason : null;
  return { status, txHash, reason };
}

/**
 * Settles one queued offline voucher. It is the whole job, kept apart from any transport so it runs the same way
 * whether a long-lived BullMQ worker (`SettlementProcessor`), an on-demand drain (`SettlementDrainService`) or a
 * QStash delivery (`SettlementQStashController`) picked the job up.
 *
 * The person who texted the voucher is often offline, so a text is their only news: they get one when the payment
 * goes through and one when it finally cannot (never for a failure that will be retried). The receiver gets one when
 * it goes through. The app may have settled the same voucher over the internet first; that counts as going through.
 */
export class SettlementJobRunner {
  private readonly logger = new Logger(SettlementJobRunner.name);

  constructor(
    private readonly settlements: SettlementsService,
    private readonly sms?: SmsService,
  ) {}

  async run(job: SettlementJob) {
    if (job.name !== ENGINE_SETTLEMENT_JOB) {
      throw new UnrecoverableError(`Unsupported settlement job: ${job.name}`);
    }
    if (typeof job.data?.smsBody !== 'string' || job.data.smsBody.length === 0) {
      throw new UnrecoverableError('Settlement job is missing smsBody');
    }

    let result: SettlementResult;
    try {
      result = await this.settlements.processSettlement(job.data.smsBody, job.data.senderPhone);
    } catch (error) {
      const decided = decidedElsewhere(error);
      if (decided?.status === 'SETTLED') {
        await this.notifySettled(job);
        return { status: decided.status, txHash: decided.txHash };
      }
      if (decided?.status === 'FAILED') {
        await this.notifyFailed(job, userFailureReason(decided.reason));
        throw new UnrecoverableError('Voucher already failed');
      }
      if (error instanceof HttpException && error.getStatus() < 500 &&
          ![408, 429].includes(error.getStatus()) && !isRetryableSettlementError(error)) {
        const reason = normalizeSettlementFailure(error);
        this.logger.warn(`Settlement job ${job.id} will not retry: ${reason}`);
        await this.notifyFailed(job, userFailureReason(error));
        throw new UnrecoverableError(reason);
      }
      throw error;
    }

    if (result.status === 'PENDING') {
      throw new Error(`Settlement ${result.txHash ?? ''} has not been confirmed (timeout)`);
    }
    if (result.status === 'SETTLED') await this.notifySettled(job);
    else if (result.status === 'FAILED') await this.notifyFailed(job, userFailureReason(result.reason ?? null));
    return result;
  }

  private async notifySettled(job: SettlementJob): Promise<void> {
    if (!this.sms) return;
    const notice = await this.settlements.describeSettledVoucher(job.data.smsBody).catch(() => null);
    if (!notice) {
      await this.send(job.data.senderPhone, 'HoneBill: Your offline payment went through.', `settlement-receipt:${job.id}:sender`, job.data.traceId);
      return;
    }
    await this.sendSettled(notice, job.data.senderPhone, job.data.traceId);
  }

  async notifyRecovered(settlementId: number): Promise<void> {
    if (!this.sms) return;
    const recovered = await this.settlements.recoveredReceipt(settlementId);
    if (!recovered) return;
    await this.sendSettled(recovered.notice, recovered.relayPhone, undefined, 4_000);
  }

  private async sendSettled(notice: VoucherNotice, relayPhone?: string, traceId?: string, deadlineMs?: number): Promise<void> {
    const sender = notice.senderPhone ? normalizePhoneNumber(notice.senderPhone) : undefined;
    const receiver = notice.receiverPhone ? normalizePhoneNumber(notice.receiverPhone) : undefined;
    const relay = relayPhone ? normalizePhoneNumber(relayPhone) : undefined;
    const receiptKey = `settlement-receipt:${notice.nonce}`;
    const token = notice.tokenContractId
      ? { contractId: notice.tokenContractId, symbol: notice.symbol, decimals: notice.decimals }
      : null;
    const [senderBalance, receiverBalance] = await Promise.all([
      sender && notice.senderAddress && token ? this.sms?.receiptBalance(sender, notice.senderAddress, token) : null,
      receiver && notice.receiverAddress && token ? this.sms?.receiptBalance(receiver, notice.receiverAddress, token) : null,
    ]);
    const outgoing = settledText(notice);
    if (sender) {
      await this.send(sender, senderBalance ? `${outgoing}. ${senderBalance}` : outgoing, `${receiptKey}:sender`, traceId, deadlineMs);
    }
    if (receiver && receiver !== sender) {
      const incoming = receivedText(notice);
      await this.send(receiver, receiverBalance ? `${incoming}. ${receiverBalance}` : incoming, `${receiptKey}:receiver`, traceId, deadlineMs);
    }
    if (relay && relay !== sender && relay !== receiver) {
      await this.send(relay, outgoing, `${receiptKey}:${sender ? 'relay' : 'sender'}`, traceId, deadlineMs);
    }
    await this.settlements.clearReceiptRelay(notice.nonce);
  }

  private async notifyFailed(job: SettlementJob, reason: string): Promise<void> {
    const notice = await this.describe(job);
    const message = notice
      ? failedText(notice, reason)
      : `HoneBill: Your offline payment did not go through. ${reason} No money was taken.`;
    await this.send(job.data.senderPhone, message, `settlement-failed:${notice?.nonce ?? job.id}:sender`, job.data.traceId);
  }

  /** Voucher details for the texts. Best effort: a text with fewer details beats no text. */
  private async describe(job: SettlementJob): Promise<VoucherNotice | null> {
    try {
      return (await this.settlements.describeVoucher(job.data.smsBody)) ?? null;
    } catch {
      return null;
    }
  }

  /** Queues one text. A text that cannot be queued is logged, never allowed to fail the settlement job. */
  private async send(to: string | undefined, message: string, dedupKey: string, traceId?: string, deadlineMs?: number): Promise<void> {
    if (!to || !this.sms) return;
    // The durable claim also covers direct SMS delivery when BullMQ is disabled. An ambiguous provider response is not resent.
    if (!await this.settlements.claimReceipt(dedupKey)) return;
    try {
      const notification = await this.sms.enqueueSms(to, message, { traceId, dedupKey, ...(deadlineMs ? { deadlineMs } : {}) });
      if (!notification.queued && !notification.delivered) {
        this.logger.warn('A settlement receipt could not be queued or delivered.');
      }
    } catch {
      this.logger.warn('A settlement receipt could not be queued or delivered.');
    }
  }
}
