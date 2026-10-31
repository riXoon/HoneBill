import crypto from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import {
  maskPhoneNumber,
  readBoundedRequestBody,
  sanitizeLogData,
  verifyTextbeeHmac,
  verifyTimestampDrift,
} from './sms-security.util.js';

describe('SMS ingress security utilities', () => {
  it('accepts the raw-body HMAC with optional sha256 prefix and rejects tampering', () => {
    const rawBody = '{ "event":"RECEIVED", "data": {"message":"x"} }';
    const secret = 'webhook-secret';
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    expect(verifyTextbeeHmac(rawBody, signature, secret)).toBe(true);
    expect(verifyTextbeeHmac(rawBody, `SHA256=${signature}`, secret)).toBe(true);
    expect(verifyTextbeeHmac(`${rawBody} `, signature, secret)).toBe(false);
    const nonUtf8Body = Buffer.from([0x7b, 0xff, 0x7d]);
    const byteSignature = crypto.createHmac('sha256', secret).update(nonUtf8Body).digest('hex');
    expect(verifyTextbeeHmac(nonUtf8Body, byteSignature, secret)).toBe(true);
    expect(verifyTextbeeHmac(rawBody, signature, 'wrong-secret')).toBe(false);
  });

  it('rejects absent, malformed, or non-hex signatures without throwing', () => {
    for (const signature of [null, '', 'short', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64)]) {
      expect(verifyTextbeeHmac('{}', signature, 'secret')).toBe(false);
    }
    expect(verifyTextbeeHmac('{}', 'a'.repeat(64), '')).toBe(false);
  });

  it('allows omitted timestamps and validates seconds or milliseconds within five minutes', () => {
    const nowMs = Date.parse('2026-10-31T00:00:00Z');
    expect(verifyTimestampDrift(null, 300, nowMs)).toEqual({ valid: true });
    expect(verifyTimestampDrift('', 300, nowMs)).toEqual({ valid: true });
    expect(verifyTimestampDrift(String(nowMs / 1000), 300, nowMs)).toEqual({ valid: true });
    expect(verifyTimestampDrift(String(nowMs), 300, nowMs)).toEqual({ valid: true });
    expect(verifyTimestampDrift(String(nowMs / 1000 - 301), 300, nowMs).valid).toBe(false);
    expect(verifyTimestampDrift('bad', 300, nowMs).reason).toContain('Unparseable timestamp');
  });

  it('reads bounded bodies and rejects oversized content-length or streams', async () => {
    const bodyText = JSON.stringify({ hello: 'world' });
    const underLimit = await readBoundedRequestBody(new Request('http://localhost', {
      method: 'POST',
      body: bodyText,
      headers: { 'content-length': String(Buffer.byteLength(bodyText)) },
    }));
    expect(underLimit).toEqual({ rawBody: bodyText, exceeded: false });

    const earlyReject = await readBoundedRequestBody(new Request('http://localhost', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': '3000' },
    }));
    expect(earlyReject).toEqual({ rawBody: '', exceeded: true });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1500));
        controller.enqueue(new Uint8Array(1500));
        controller.close();
      },
    });
    const streamed = await readBoundedRequestBody(new Request('http://localhost', {
      method: 'POST', body: stream, duplex: 'half',
    } as RequestInit));
    expect(streamed).toEqual({ rawBody: '', exceeded: true });
  });

  it('masks phone numbers and recursively redacts secrets in logs', () => {
    expect(maskPhoneNumber('+639171234567')).toBe('+639*****4567');
    expect(maskPhoneNumber('09171234567')).toBe('091****4567');
    expect(maskPhoneNumber('123')).toBe('[REDACTED]');

    const seed = `S${'A'.repeat(55)}`;
    const result = sanitizeLogData({
      seed,
      nested: { auth: 'Bearer token.123' },
      values: [seed, 'public'],
    });
    expect(result.seed).toBe('[REDACTED]');
    expect(result.nested).toEqual({ auth: '[REDACTED]' });
    expect(result.values).toEqual(['[REDACTED]', 'public']);
  });
});
