import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@upstash/qstash';
import { API_BASE_PATH } from '../../common/api-prefix.js';
import type { SettlementJobData } from '../settlements/settlement-queue.constants.js';
import { SettlementPublisher, settlementJobIdFor } from './settlement-publisher.js';

/** The route QStash delivers each voucher to (settlement-qstash.controller.ts). */
export const QSTASH_SETTLEMENT_PATH = `${API_BASE_PATH}/settlements/qstash`;

const DEFAULT_RETRIES = 3;

export type QStashPublishRequest = {
  url: string;
  body: SettlementJobData;
  deduplicationId: string;
  retries: number;
};

/**
 * Publishes each voucher to Upstash QStash, which then POSTs it to this backend's settlement route and retries that
 * call (exponential backoff) until it answers 2xx or the retries run out. No worker or Redis queue is involved.
 */
@Injectable()
export class QStashSettlementPublisher extends SettlementPublisher {
  private client: Client | null = null;

  constructor(private readonly config: ConfigService) {
    super();
  }

  async enqueue(smsBody: string, metadata: Pick<SettlementJobData, 'senderPhone' | 'traceId'> = {}): Promise<{ jobId: string }> {
    const jobId = settlementJobIdFor(smsBody);
    const url = this.callbackUrl();
    if (!url) throw new Error('QStash settlement URL is not configured (QSTASH_SETTLEMENT_URL or NEXT_PUBLIC_APP_URL)');
    const messageId = await this.publish({
      url,
      body: { ...metadata, smsBody },
      deduplicationId: jobId,
      retries: this.retries(),
    });
    return { jobId: messageId ?? jobId };
  }

  /** Sends one message to QStash; returns its message ID. Overridden in tests. */
  protected async publish(request: QStashPublishRequest): Promise<string | undefined> {
    const response = await this.getClient().publishJSON(request);
    return (response as { messageId?: string }).messageId;
  }

  private getClient(): Client {
    const token = this.config.get<string>('QSTASH_TOKEN')?.trim();
    if (!token) throw new Error('QSTASH_TOKEN is not configured');
    const baseUrl = this.config.get<string>('QSTASH_URL')?.trim();
    this.client ??= new Client({ token, ...(baseUrl ? { baseUrl } : {}) });
    return this.client;
  }

  /** QSTASH_SETTLEMENT_URL when set, otherwise this backend's public URL plus the settlement route. */
  private callbackUrl(): string | null {
    const explicit = this.config.get<string>('QSTASH_SETTLEMENT_URL')?.trim();
    if (explicit) return explicit;
    const origin = this.config.get<string>('NEXT_PUBLIC_APP_URL')?.trim().replace(/\/+$/, '');
    return origin ? `${origin}${QSTASH_SETTLEMENT_PATH}` : null;
  }

  private retries(): number {
    const value = Number(this.config.get<string | number>('QSTASH_SETTLEMENT_RETRIES') ?? DEFAULT_RETRIES);
    return Number.isInteger(value) && value >= 0 ? value : DEFAULT_RETRIES;
  }
}
