import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from '@jest/globals';
import { createHmac } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { ApiResponseException } from '../../../common/exceptions/api-response.exception.js';
import { TextbeeSignatureGuard } from './textbee-signature.guard.js';

function contextFor(request: Record<string, any>): ExecutionContext {
  request.header ??= (name: string) => request.headers?.[name.toLowerCase()];
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TextbeeSignatureGuard', () => {
  it('accepts an HMAC over the original raw JSON bytes', () => {
    const body = Buffer.from('{ "event":"RECEIVED", "message":"hello" }');
    const secret = 'hook-secret';
    const signature = createHmac('sha256', secret).update(body.toString('utf8')).digest('hex');
    const request: Record<string, any> = {
      method: 'POST',
      rawBody: body,
      headers: { 'x-textbee-signature': signature },
    };
    const guard = new TextbeeSignatureGuard(new ConfigService({ TEXTBEE_WEBHOOK_SECRET: secret }));

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.traceId).toEqual(expect.any(String));
  });

  it.each([undefined, 'invalid', 'a'.repeat(64)])('rejects missing or invalid signature %s', (signature) => {
    const request: Record<string, any> = {
      method: 'POST',
      rawBody: Buffer.from('{}'),
      headers: { ...(signature ? { 'x-signature': signature } : {}) },
    };
    const guard = new TextbeeSignatureGuard(new ConfigService({ TEXTBEE_WEBHOOK_SECRET: 'secret' }));
    try {
      guard.canActivate(contextFor(request));
      throw new Error('expected request rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiResponseException);
      expect((error as ApiResponseException).getStatus()).toBe(401);
      expect((error as ApiResponseException).responseBody).toMatchObject({
        error: 'Unauthorized: Invalid HMAC Signature',
        traceId: expect.any(String),
      });
    }
  });

  it('rejects tampered bodies and stale timestamps', () => {
    const secret = 'secret';
    const signature = createHmac('sha256', secret).update('{}').digest('hex');
    const guard = new TextbeeSignatureGuard(new ConfigService({ TEXTBEE_WEBHOOK_SECRET: secret }));
    const tampered: Record<string, any> = {
      method: 'POST', rawBody: Buffer.from('{ }'), headers: { 'x-signature': signature },
    };
    expect(() => guard.canActivate(contextFor(tampered))).toThrow(ApiResponseException);

    const stale: Record<string, any> = {
      method: 'POST', rawBody: Buffer.from('{}'),
      headers: { 'x-signature': signature, 'x-timestamp': '1' },
    };
    try {
      guard.canActivate(contextFor(stale));
    } catch (error) {
      expect((error as ApiResponseException).responseBody.error).toContain('Request timestamp rejected');
    }
  });

  it('fails closed when the webhook secret is missing', () => {
    const body = Buffer.from('{}');
    const request: Record<string, any> = {
      method: 'POST', rawBody: body,
      headers: { 'x-signature': createHmac('sha256', 'secret').update('{}').digest('hex') },
    };
    expect(() => new TextbeeSignatureGuard(new ConfigService({})).canActivate(contextFor(request)))
      .toThrow(ApiResponseException);
  });

  it('does not trust a reserialized body when only a parsed JSON object is present', () => {
    const request: Record<string, any> = {
      method: 'POST', body: { trusted: true }, headers: {},
    };
    expect(() => new TextbeeSignatureGuard(new ConfigService({ TEXTBEE_WEBHOOK_SECRET: 'secret' }))
      .canActivate(contextFor(request))).toThrow(ApiResponseException);
  });
});
