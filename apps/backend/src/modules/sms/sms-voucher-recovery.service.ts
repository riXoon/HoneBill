import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { isPlausiblePhone } from '../../common/utils/phone.util.js';
import { LockService } from '../../infra/lock/lock.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { withinSettlementDeadline } from '../settlements/settlement-rpc-deadline.js';
import { parseOfflineVoucher } from '../settlements/offline-voucher.util.js';
import { SmsService } from './sms.service.js';
import { SMS_WEBHOOK_MESSAGE_MAX_CHARS } from './sms.constants.js';

const DAY_MS = 86_400_000;
const LOOKBACK_MS = 7 * DAY_MS;
const RUN_BUDGET_MS = 12_000;
const HISTORY_URL = 'https://api.textbee.dev/api/v1/gateway/messages';
type Cursor = { from: number; to: number; next: string };
type ReceivedSms = { message?: unknown; sender?: unknown; direction?: unknown; receivedAt?: unknown; createdAt?: unknown; device?: { _id?: unknown } };

@Injectable()
export class SmsVoucherRecoveryService {
  private readonly logger = new Logger(SmsVoucherRecoveryService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly locks: LockService,
    private readonly sms: SmsService,
  ) {}

  async run() {
    const activation = Date.parse(this.config.get<string>('TEXTBEE_RECOVERY_START_AT') ?? '');
    if (!Number.isFinite(activation) || activation >= Date.now()) return { status: 'off' };
    const device = this.config.get<string>('TEXTBEE_DEVICE_ID')?.trim();
    const key = this.config.get<string>('TEXTBEE_API_KEY')?.trim();
    if (!device || !key) return { status: 'unconfigured' };

    const checkpoint = `honebill:sms:history:${device}:${activation}`;
    const lockKey = `${checkpoint}:lock`;
    const lock = randomUUID();
    if (!await this.locks.acquire(lockKey, lock, 30_000)) return { status: 'busy' };
    const deadline = Date.now() + RUN_BUDGET_MS;
    try {
      const redis = this.redis.getClient();
      const now = Date.now();
      const earliest = Math.max(activation, now - LOOKBACK_MS);
      const prior = this.readCursor(await redis.get(checkpoint));
      const cursor = prior && prior.to > earliest ? prior : null;
      const from = cursor?.from ?? earliest;
      const to = cursor?.to ?? now;
      const url = new URL(HISTORY_URL);
      url.search = new URLSearchParams({ direction: 'received', deviceIds: device, order: 'asc', limit: '25',
        from: new Date(from).toISOString(), to: new Date(to).toISOString(), ...(cursor ? { cursor: cursor.next } : {}) }).toString();

      const response = await fetch(url, { headers: { 'x-api-key': key }, signal: AbortSignal.timeout(5_000), redirect: 'error' });
      if (!response.ok) throw new Error(`TextBee message history returned HTTP ${response.status}`);
      const data = await response.json() as { data?: ReceivedSms[] | { messages?: ReceivedSms[] }; meta?: { hasMore?: boolean; nextCursor?: string } };
      const messages = Array.isArray(data.data) ? data.data : data.data?.messages;
      if (!Array.isArray(messages) || typeof data.meta?.hasMore !== 'boolean') throw new Error('Invalid TextBee history page');
      if (data.meta.hasMore && (!data.meta.nextCursor || data.meta.nextCursor === cursor?.next)) throw new Error('Invalid TextBee history cursor');

      let buffered = 0;
      for (const item of messages) {
        const { message, sender } = item ?? {};
        const receivedAt = Date.parse(String(item?.receivedAt ?? item?.createdAt ?? ''));
        if (item?.direction !== 'received' || item.device?._id !== device ||
          typeof message !== 'string' || message.length > SMS_WEBHOOK_MESSAGE_MAX_CHARS || !/^\d+:/.test(message.trim()) ||
          typeof sender !== 'string' || !/^\+?[\d ().-]+$/.test(sender) || !isPlausiblePhone(sender) ||
          !Number.isFinite(receivedAt) || receivedAt < earliest || receivedAt >= to) continue;
        let nonce: string;
        try { nonce = parseOfflineVoucher(message).nonce.toString('base64'); } catch { continue; }
        const seenKey = `honebill:sms:history:seen:${nonce}`;
        const processed = await withinSettlementDeadline(async () => {
          if (await redis.get(seenKey)) return false;
          const result = await this.sms.bufferVoucher(message, sender, randomUUID());
          if (result.status !== 'Buffered' && result.status !== 'Duplicate Replay') throw new Error('Unable to buffer a recovered voucher');
          await redis.set(seenKey, '1', 'EX', 8 * 86_400);
          return result.status === 'Buffered';
        }, deadline);
        if (processed) buffered++;
      }

      if (data.meta.hasMore) {
        await redis.set(checkpoint, JSON.stringify({ from, to, next: data.meta.nextCursor }), 'EX', 7 * 86_400);
      } else {
        // Start another scan next run. TextBee can backdate late uploads, so a forward-only cursor would miss them.
        await redis.del(checkpoint);
      }
      return { status: 'ok', checked: messages.length, buffered, hasMore: data.meta.hasMore };
    } finally {
      await this.locks.release(lockKey, lock).catch(() => this.logger.warn('TextBee history scan lock will expire.'));
    }
  }

  private readCursor(value: string | null): Cursor | null {
    if (!value) return null;
    try {
      const saved = JSON.parse(value) as Partial<Cursor>;
      return typeof saved.from === 'number' && typeof saved.to === 'number' && typeof saved.next === 'string'
        && Number.isFinite(saved.from) && Number.isFinite(saved.to) && saved.from < saved.to && saved.next
        ? { from: saved.from, to: saved.to, next: saved.next } : null;
    } catch {
      return null;
    }
  }
}
