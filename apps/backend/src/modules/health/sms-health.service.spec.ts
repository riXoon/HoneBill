import { describe, expect, it } from '@jest/globals';
import { SmsHealthService } from './sms-health.service.js';

describe('SmsHealthService', () => {
  const service = new SmsHealthService({} as any);
  const now = Date.parse('2026-10-31T00:00:00Z');

  it('classifies recent, stale, disabled, and missing TextBee devices', () => {
    expect(service.classifyDevice({ enabled: true, lastHeartbeat: '2026-10-31T00:01:00Z' }, now).status).toBe('online');
    expect(service.classifyDevice({ enabled: true, lastHeartbeat: '2026-10-30T23:00:00Z' }, now).status).toBe('offline');
    expect(service.classifyDevice({ enabled: false }, now).status).toBe('disabled');
    expect(service.classifyDevice({ enabled: true }, now).status).toBe('unknown');
    expect(service.classifyDevice(undefined, now).status).toBe('unknown');
  });
});
