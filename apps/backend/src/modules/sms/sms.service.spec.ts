import { describe, expect, it, jest } from '@jest/globals';
import { SmsService } from './sms.service.js';

describe('SmsService', () => {
  const config = { get: jest.fn((key: string) => key === 'TEXTBEE_WEBHOOK_SECRET' ? 'secret' : undefined) } as any;
  const redis = { getClient: jest.fn(() => ({
    eval: jest.fn<(...args: any[]) => Promise<number>>().mockResolvedValue(1),
    set: jest.fn<(...args: any[]) => Promise<string | null>>().mockResolvedValue('OK'),
  })) } as any;
  const textbee = { deliver: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ success: true, gateway: 'primary', attempts: 1 }) } as any;

  it('keeps the direct delivery fallback when the queue is disabled', async () => {
    const service = new SmsService(textbee, redis, config);
    await expect(service.enqueueSms('+639171234567', 'hello')).resolves.toEqual({ queued: false, delivered: true });
    expect(textbee.deliver).toHaveBeenCalledWith('+639171234567', 'hello');
  });

  it('publishes queued messages with retries and a stable deduplication id', async () => {
    const add = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ id: 'sms-1' });
    const service = new SmsService(textbee, redis, config, { add } as any);
    await expect(service.enqueueSms('+639171234567', 'hello', { dedupKey: 'voucher:+1' }))
      .resolves.toEqual({ queued: true, messageId: 'sms-1' });
    expect(add).toHaveBeenCalledWith('deliver', expect.objectContaining({ message: 'hello' }), expect.objectContaining({
      jobId: 'voucher__1', attempts: 4,
    }));
  });

  it('ignores TextBee delivery receipts without publishing a settlement', async () => {
    const settlementQueue = { add: jest.fn() };
    const service = new SmsService(textbee, redis, config, undefined, settlementQueue as any);
    await expect(service.processWebhook(Buffer.from('{"event":"MESSAGE_SENT"}'), 'trace'))
      .resolves.toEqual({ success: true, message: 'Delivery receipt ignored' });
    expect(settlementQueue.add).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON and malformed voucher messages with a trace id', async () => {
    const service = new SmsService(textbee, redis, config, undefined, { add: jest.fn() } as any);
    await expect(service.processWebhook(Buffer.from('{'), 'trace'))
      .resolves.toEqual({ error: 'Invalid JSON body', traceId: 'trace' });
    await expect(service.processWebhook(Buffer.from(JSON.stringify({ event: 'MESSAGE_RECEIVED', data: {
      sender: '+639171234567', message: 'not-a-voucher',
    } })), 'trace')).resolves.toMatchObject({ error: expect.stringContaining('expected 6 parts'), traceId: 'trace' });
  });
});
