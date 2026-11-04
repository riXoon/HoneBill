import { describe, expect, it, jest } from '@jest/globals';
import type { Job } from 'bullmq';
import type { TextbeeService } from '../../otp/textbee.service.js';
import { SmsDispatchProcessor } from './sms-dispatch.processor.js';
import type { SmsJob } from '../sms.service.js';

describe('SMS dispatch worker delivery outcomes', () => {
  const job = { data: { to: '+639171234567', message: 'receipt', traceId: 'test' } } as Job<SmsJob>;
  it('accepts gateway success with one attempt per device', async () => {
    const deliver = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ success: true, gateway: 'primary' });
    await expect(new SmsDispatchProcessor({ deliver } as unknown as TextbeeService).process(job)).resolves.toEqual({ success: true });
    expect(deliver).toHaveBeenCalledWith(job.data.to, job.data.message, { retries: 0, deadlineMs: 9000 });
  });
  it('throws transient errors so BullMQ can retry', async () => {
    const deliver = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ success: false, retryable: true });
    await expect(new SmsDispatchProcessor({ deliver } as unknown as TextbeeService).process(job)).rejects.toThrow('SMS delivery failed, will retry');
  });
  it('returns a permanent failure without scheduling a retry', async () => {
    const deliver = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ success: false, retryable: false });
    await expect(new SmsDispatchProcessor({ deliver } as unknown as TextbeeService).process(job)).resolves.toEqual({ success: false, error: 'Undeliverable' });
  });
});
