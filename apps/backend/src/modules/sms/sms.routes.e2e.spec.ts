import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { configureSmsWebhookMiddleware } from '../../common/middleware/sms-webhook.middleware.js';
import { configureRequestBodyParsing } from '../../common/middleware/request-body.middleware.js';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter.js';
import { SmsDispatchSecretGuard } from './guards/sms-dispatch-secret.guard.js';
import { TextbeeSignatureGuard } from './guards/textbee-signature.guard.js';
import { SmsController } from './sms.controller.js';
import { SmsService } from './sms.service.js';

describe('SMS HTTP routes', () => {
  let app: NestExpressApplication;
  const sms = {
    dispatch: jest.fn<(job: { to: string; message: string }) => Promise<unknown>>(),
    processWebhook: jest.fn<(rawBody: Buffer, traceId: string) => Promise<Record<string, unknown>>>(),
    webhookHealth: jest.fn<() => Promise<Record<string, unknown>>>(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SmsController],
      providers: [
        SmsDispatchSecretGuard,
        TextbeeSignatureGuard,
        { provide: ConfigService, useValue: new ConfigService({ SMS_DISPATCH_SECRET: 'dispatch-secret', TEXTBEE_WEBHOOK_SECRET: 'webhook-secret' }) },
        { provide: SmsService, useValue: sms },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    app.setGlobalPrefix('api/v2');
    configureSmsWebhookMiddleware(app);
    configureRequestBodyParsing(app);
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  it('requires the agreed shared secret for the compatibility dispatch route', async () => {
    await request(app.getHttpServer()).post('/api/v2/sms/dispatch').send({ to: '+639171234567', message: 'hi' }).expect(401);
    sms.dispatch.mockResolvedValueOnce({ success: true });
    await request(app.getHttpServer()).post('/api/v2/sms/dispatch')
      .set('x-sms-dispatch-secret', 'dispatch-secret')
      .send({ to: '+639171234567', message: 'hi' }).expect(200, { success: true });
  });

  it('checks the exact signed webhook bytes and passes the bounded raw body to the handler', async () => {
    const raw = '{ "event":"MESSAGE_RECEIVED", "data":{"sender":"+639171234567","message":"voucher"} }';
    const signature = createHmac('sha256', 'webhook-secret').update(raw).digest('hex');
    sms.processWebhook.mockResolvedValueOnce({ success: true, status: 'Buffered', traceId: 'route-trace' });
    await request(app.getHttpServer()).post('/api/v2/sms/webhook').type('application/json').set('x-signature', signature).send(raw)
      .expect(200, { success: true, status: 'Buffered', traceId: 'route-trace' });
    expect(sms.processWebhook).toHaveBeenCalledWith(Buffer.from(raw), expect.any(String));
    await request(app.getHttpServer()).post('/api/v2/sms/webhook').type('application/json').set('x-signature', signature).send(`${raw} `).expect(401);
  });

  it('rejects webhook bodies above 2 KB before handler execution', async () => {
    sms.processWebhook.mockClear();
    await request(app.getHttpServer()).post('/api/v2/sms/webhook').type('application/json').send(`{"payload":"${'x'.repeat(2100)}"}`).expect(413);
    expect(sms.processWebhook).not.toHaveBeenCalled();
  });

  it.each(['put', 'patch', 'delete'] as const)('returns an empty legacy 405 for %s on both SMS routes', async (method) => {
    for (const path of ['/api/v2/sms/webhook', '/api/v2/sms/dispatch']) {
      const response = await request(app.getHttpServer())[method](path);
      expect(response.status).toBe(405);
      expect(response.text).toBe('');
      expect(response.headers.allow).toBeUndefined();
    }
  });

  it('returns 405 for GET dispatch while keeping GET webhook available', async () => {
    await request(app.getHttpServer()).get('/api/v2/sms/dispatch').expect(405, '');
    sms.webhookHealth.mockResolvedValueOnce({ success: true, route: '/api/v2/sms/webhook' });
    await request(app.getHttpServer()).get('/api/v2/sms/webhook').expect(200, { success: true, route: '/api/v2/sms/webhook' });
  });

  it('authenticates dispatch before parsing and preserves the legacy malformed-JSON error', async () => {
    await request(app.getHttpServer()).post('/api/v2/sms/dispatch').type('application/json').send('{')
      .expect(401, { error: 'Unauthorized' });
    await request(app.getHttpServer()).post('/api/v2/sms/dispatch').set('x-sms-dispatch-secret', 'dispatch-secret')
      .type('application/json').send('{').expect(400, { error: 'Invalid JSON body' });
  });

  it.each([{}, { to: 123, message: 'hi' }, { to: '+639171234567', message: '' }, null])('rejects invalid authenticated dispatch payload %j', async (body) => {
    await request(app.getHttpServer()).post('/api/v2/sms/dispatch').set('x-sms-dispatch-secret', 'dispatch-secret')
      .type('application/json').send(JSON.stringify(body)).expect(400, { error: 'Job requires `to` and `message`' });
  });
});
