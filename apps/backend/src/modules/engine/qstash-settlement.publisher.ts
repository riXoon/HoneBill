import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@upstash/qstash';
import { API_BASE_PATH } from '../../common/api-prefix.js';
import type { SettlementJobData } from '../settlements/settlement-queue.constants.js';
import { SettlementPublisher, settlementJobIdFor } from './settlement-publisher.js';
import { configValue } from './env-value.js';

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
    const token = configValue(this.config, 'QSTASH_TOKEN');
    if (!token) throw new Error('QSTASH_TOKEN is not configured');
    const baseUrl = configValue(this.config, 'QSTASH_URL').replace(/\/+$/, '');
    this.client ??= new Client({ token, ...(baseUrl ? { baseUrl } : {}) });
    return this.client;
  }

  /** QSTASH_SETTLEMENT_URL when set, otherwise this backend's public URL plus the settlement route. */
  private callbackUrl(): string | null {
    const explicit = configValue(this.config, 'QSTASH_SETTLEMENT_URL');
    if (explicit) return explicit;
    const origin = configValue(this.config, 'NEXT_PUBLIC_APP_URL').replace(/\/+$/, '');
    return origin ? `${origin}${QSTASH_SETTLEMENT_PATH}` : null;
  }

  private retries(): number {
    const raw = this.config.get<string | number>('QSTASH_SETTLEMENT_RETRIES');
    const value = raw === undefined || raw === '' ? DEFAULT_RETRIES : Number(typeof raw === 'string' ? configValue(this.config, 'QSTASH_SETTLEMENT_RETRIES') : raw);
    return Number.isInteger(value) && value >= 0 ? value : DEFAULT_RETRIES;
  }
}
