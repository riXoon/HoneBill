import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { LockService } from '../../infra/lock/lock.service.js';
import type { RedisService } from '../../infra/redis/redis.service.js';
import type { SmsService } from './sms.service.js';
import { SmsVoucherRecoveryService } from './sms-voucher-recovery.service.js';

afterEach(() => { jest.restoreAllMocks(); });

describe('TextBee missed vouchers', () => {
  it('scans received messages for the configured device, skips previously buffered vouchers and advances by cursor', async () => {
    const now = Date.now();
    const voucher = `1:abc123:def456:1:${Buffer.alloc(32, 1).toString('base64')}:${Buffer.alloc(64, 1).toString('base64')}`;
    const missed = voucher.replace(Buffer.alloc(32, 1).toString('base64'), Buffer.alloc(32, 2).toString('base64'));
    const received = { direction: 'received', device: { _id: 'device' }, sender: '+639170000001',
      message: voucher, receivedAt: new Date(now - 1000).toISOString() };
    const get = new Map<string, string>();
    const redis = { getClient: () => ({
      get: async (key: string) => get.get(key) ?? null,
      set: async (key: string, value: string) => { get.set(key, value); },
      del: async (key: string) => { get.delete(key); },
    }) };
    const locks = { acquire: jest.fn(async () => true), release: jest.fn(async () => true) };
    const bufferVoucher = jest.fn(async (message: string, _phone: string, _trace: string) =>
      ({ status: message === missed ? 'Buffered' : 'Duplicate Replay' }));
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => Response.json({
      data: [{ ...received, message: '/check-balance' }, { ...received, device: { _id: 'different' } }, received],
      meta: { hasMore: true, nextCursor: 'next' },
    })).mockImplementationOnce(async () => Response.json({ data: [received, { ...received, message: missed }], meta: { hasMore: false } }));
    const service = new SmsVoucherRecoveryService(
      new ConfigService({ TEXTBEE_RECOVERY_START_AT: new Date(now - 60_000).toISOString(), TEXTBEE_DEVICE_ID: 'device', TEXTBEE_API_KEY: 'fixture' }),
      redis as unknown as RedisService, locks as unknown as LockService, { bufferVoucher } as unknown as SmsService,
    );

    await expect(service.run()).resolves.toMatchObject({ checked: 3, buffered: 0, hasMore: true });
    await expect(service.run()).resolves.toMatchObject({ checked: 2, buffered: 1, hasMore: false });
    expect(bufferVoucher).toHaveBeenCalledTimes(2);
    expect(bufferVoucher).toHaveBeenCalledWith(voucher, received.sender, expect.any(String));
    expect(bufferVoucher).toHaveBeenCalledWith(missed, received.sender, expect.any(String));
    expect(String(fetch.mock.calls[0][0])).toContain('deviceIds=device');
    expect(String(fetch.mock.calls[1][0])).toContain('cursor=next');
    expect([...get.keys()]).toEqual([1, 2].map((byte) => `honebill:sms:history:seen:${Buffer.alloc(32, byte).toString('base64')}`));
    expect(locks.release).toHaveBeenCalledTimes(2);
  });
});
