import { createHash } from 'node:crypto';
import { parseOfflineVoucher } from '../settlements/offline-voucher.util.js';
import type { SettlementJobData } from '../settlements/settlement-queue.constants.js';

/**
 * Hands a received voucher to whichever transport settles it (see settlement-transport.ts). The SMS webhook depends
 * on this, not on BullMQ or QStash, so the transport can change without touching the webhook.
 */
export abstract class SettlementPublisher {
  abstract enqueue(smsBody: string, metadata?: Pick<SettlementJobData, 'senderPhone' | 'traceId'>): Promise<{ jobId: string }>;
}

/**
 * One ID per voucher, from its nonce: BullMQ uses it as the job ID and QStash as the deduplication ID, so a voucher
 * that arrives twice (a resent text, a retried webhook) is only queued once. Throws for a malformed voucher.
 */
export function settlementJobIdFor(smsBody: string): string {
  const { nonce } = parseOfflineVoucher(smsBody);
  return `settlement-${createHash('sha256').update(nonce).digest('hex')}`;
}
