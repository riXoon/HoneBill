import { API_BASE_PATH } from '../../common/api-prefix';
import { createHash, randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { RedisService } from '../../infra/redis/redis.service.js';
import { SettlementQueueService } from '../engine/settlement-queue.service.js';
import { parseOfflineVoucher } from '../settlements/offline-voucher.util.js';
import { TextbeeService } from '../otp/textbee.service.js';
import {
  SMS_QUEUE_NAME,
  SMS_WEBHOOK_MESSAGE_MAX_CHARS,
  SMS_WEBHOOK_NONCE_TTL_SECONDS,
} from './sms.constants.js';
import { maskPhoneNumber } from './sms-security.util.js';

export interface SmsJob {
  to: string;
  message: string;
  traceId?: string;
}

export type EnqueueSmsResult =
  | { queued: true; messageId: string }
  | { queued: false; delivered: boolean; error?: string };

interface WebhookPayload extends Record<string, unknown> {}
interface ExtractedSms {
  senderPhone: string;
  message: string;
  eventType: string;
}

/** Atomically trims old sender events, checks the cap, records this request, and sets key expiry. */
const RATE_LIMIT_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return 1
`;

/** Selects the first object in gateway payload wrappers without trusting other value types. */
function firstObject(value: unknown): WebhookPayload | null {
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === 'object');
    return first && typeof first === 'object' ? first as WebhookPayload : null;
  }
  return value && typeof value === 'object' ? value as WebhookPayload : null;
}

/** Normalizes the sender and message fields used by different TextBee webhook versions. */
function extractSmsPayload(body: WebhookPayload): ExtractedSms | null {
  const candidate = firstObject(body.data) ?? firstObject(body.message) ?? firstObject(body.messages) ?? body;
  const senderPhone = typeof candidate.sender === 'string' ? candidate.sender.trim()
    : typeof candidate.from === 'string' ? candidate.from.trim()
      : typeof candidate.phone === 'string' ? candidate.phone.trim() : '';
  const message = typeof candidate.message === 'string' ? candidate.message.trim()
    : typeof candidate.text === 'string' ? candidate.text.trim()
      : typeof candidate.body === 'string' ? candidate.body.trim() : '';
  const eventType = typeof body.event === 'string' ? body.event
    : typeof body.type === 'string' ? body.type
      : typeof candidate.event === 'string' ? candidate.event
        : typeof candidate.type === 'string' ? candidate.type : 'UNKNOWN';
  return senderPhone && message ? { senderPhone, message, eventType } : null;
}

/** Restricts queue job IDs to BullMQ-safe characters and length. */
function queueSafeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 200);
}

/** Owns SMS queue publishing, webhook ingress checks, nonce replay protection, and worker delivery. */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly textbee: TextbeeService,
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
    @Optional() @InjectQueue(SMS_QUEUE_NAME) private readonly smsQueue?: Queue<SmsJob>,
    @Optional() private readonly settlementQueue?: SettlementQueueService,
  ) {}

  /** Queues an outbound notification, falling back to direct gateway delivery if queues are unavailable. */
  async enqueueSms(
    to: string,
    message: string,
    options: { traceId?: string; dedupKey?: string } = {},
  ): Promise<EnqueueSmsResult> {
    if (this.smsQueue) {
      try {
        const job = await this.smsQueue.add('deliver', { to, message, traceId: options.traceId }, {
          ...(options.dedupKey ? { jobId: queueSafeId(options.dedupKey) } : {}),
          attempts: 1 + 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 86_400 },
          removeOnFail: false,
        });
        return { queued: true, messageId: String(job.id) };
      } catch (error) {
        this.logger.warn(`SMS queue publish failed; trying direct delivery: ${this.errorMessage(error)}`);
      }
    } else {
      this.logger.warn('SMS queue disabled; using the legacy direct-delivery fallback');
    }

    const result = await this.textbee.deliver(to, message);
    return result.success
      ? { queued: false, delivered: true }
      : { queued: false, delivered: false, error: result.error };
  }

  /** Preserves the HTTP dispatch contract and maps transient delivery failures to retryable errors. */
  async dispatch(job: SmsJob): Promise<{ success: true } | { success: false; error: string }> {
    const result = await this.textbee.deliver(job.to, job.message, { retries: 0, deadlineMs: 9000 });
    const trace = job.traceId ? ` traceId=${job.traceId}` : '';
    if (result.success) {
      this.logger.log(`Delivered SMS to ${maskPhoneNumber(job.to)} via ${result.gateway}${trace}`);
      return { success: true };
    }
    if (result.retryable) {
      this.logger.warn(`Transient SMS failure for ${maskPhoneNumber(job.to)}${trace}`);
      throw new ApiResponseException(500, { error: 'SMS delivery failed, will retry' });
    }
    this.logger.error(`Permanent SMS failure for ${maskPhoneNumber(job.to)}${trace}`);
    return { success: false, error: 'Undeliverable' };
  }

  /** Filters inbound events, validates voucher structure, blocks replays, and queues settlement work. */
  async processWebhook(rawBody: Buffer, traceId: string): Promise<Record<string, unknown>> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { error: 'Invalid JSON body', traceId };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Invalid JSON body', traceId };
    }
    const body = parsed as WebhookPayload;

    if (body.webhookEvent === 'MESSAGE_SENT' || body.status === 'sent' || body.event === 'MESSAGE_SENT') {
      return { success: true, message: 'Delivery receipt ignored' };
    }
    const legacyEvent = body.event === 'MESSAGE_RECEIVED';
    const newEvent = body.type === 'RECEIVED';
    const otherNamedEvent = Boolean(body.event && body.event !== 'MESSAGE_RECEIVED');
    if (!legacyEvent && !newEvent && otherNamedEvent) return { success: true, status: 'Ignored' };

    const sms = extractSmsPayload(body);
    if (!sms) return { error: 'Missing sender or message field' };
    if (sms.message.length > SMS_WEBHOOK_MESSAGE_MAX_CHARS) {
      return { error: 'SMS body exceeds maximum length', traceId };
    }

    const withinLimit = await this.allowWebhookSender(sms.senderPhone);
    if (!withinLimit) return { success: true, status: 'Rate Limited' };

    let voucher;
    try {
      voucher = parseOfflineVoucher(sms.message);
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Malformed payload', traceId };
    }

    const redis = this.redisService.getClient();
    const nonceKey = `honebill:sms:nonce:${voucher.nonce.toString('base64')}`;
    try {
      if (await redis.get(nonceKey)) return { success: true, status: 'Duplicate Replay', traceId };
    } catch (error) {
      // This short-lived cache is defense in depth; database and Soroban nonce checks remain authoritative.
      this.logger.warn(`SMS nonce cache unavailable; continuing fail-open. traceId=${traceId}: ${this.errorMessage(error)}`);
    }

    if (!this.settlementQueue) {
      this.logger.error(`Settlement queue is disabled. traceId=${traceId}`);
      throw new ApiResponseException(500, { error: 'Failed to buffer settlement' });
    }
    try {
      const job = await this.settlementQueue.enqueue(sms.message, {
        senderPhone: sms.senderPhone,
        traceId,
      });
      this.logger.log(`Buffered offline settlement ${job.jobId}; sender=${maskPhoneNumber(sms.senderPhone)} traceId=${traceId}`);
    } catch (error) {
      this.logger.error(`Settlement queue publish failed. traceId=${traceId}: ${this.errorMessage(error)}`);
      throw new ApiResponseException(500, { error: 'Failed to buffer settlement' });
    }
    // Mark only durable publishes. Concurrent requests safely converge on BullMQ's
    // atomic job-ID deduplication; an ambiguous publish failure can also be retried.
    try {
      const marked = await redis.set(nonceKey, '1', 'EX', SMS_WEBHOOK_NONCE_TTL_SECONDS, 'NX');
      if (marked === null) return { success: true, status: 'Duplicate Replay', traceId };
    } catch (error) {
      this.logger.warn(`SMS nonce cache unavailable after publish. traceId=${traceId}: ${this.errorMessage(error)}`);
    }
    return { success: true, status: 'Buffered', traceId };
  }

  /** Reports SMS webhook configuration without exposing secret values. */
  async webhookHealth(): Promise<Record<string, unknown>> {
    const debug = this.config.get<boolean | string>('OFFLINE_TRANSACTION_DEBUG');
    return {
      success: true,
      route: `${API_BASE_PATH}/sms/webhook`,
      accepts: ['POST'],
      configured: {
        textbeeWebhookSecret: Boolean(this.config.get<string>('TEXTBEE_WEBHOOK_SECRET')),
        qstashToken: false,
        nextPublicAppUrl: Boolean(this.config.get<string>('NEXT_PUBLIC_APP_URL')),
        textbeeGateway: Boolean(this.config.get<string>('TEXTBEE_GATEWAY_URL') || this.config.get<string>('TEXTBEE_DEVICE_ID')),
        textbeeApiKey: Boolean(this.config.get<string>('TEXTBEE_API_KEY')),
        offlineTransactionDebug: debug === true || (typeof debug === 'string' && debug.trim().toLowerCase() === 'true'),
      },
    };
  }

  /** Enforces the legacy three webhook requests per sender per rolling minute limit in Redis. */
  private async allowWebhookSender(senderPhone: string): Promise<boolean> {
    const now = Date.now();
    const windowMs = 60_000;
    const keySuffix = createHash('sha256').update(senderPhone).digest('hex');
    const key = `honebill:sms:webhook:${keySuffix}`;
    const result = await this.redisService.getClient().eval(
      RATE_LIMIT_SCRIPT,
      1,
      key,
      String(now - windowMs),
      '3',
      String(now),
      `${now}:${randomUUID()}`,
      String(windowMs),
    );
    return Number(result) === 1;
  }

  /** Converts unknown failures to safe, loggable text. */
  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
