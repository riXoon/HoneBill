import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import express from 'express';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter.js';
import { SmsDispatchSecretGuard } from './guards/sms-dispatch-secret.guard.js';
import { TextbeeSignatureGuard } from './guards/textbee-signature.guard.js';
import { SmsController } from './sms.controller.js';
import { SmsService } from './sms.service.js';

describe('SMS HTTP routes', () => {
  let app: INestApplication;
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
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.setGlobalPrefix('api');
    app.use('/api/sms/webhook', (req: any, _res: any, next: any) => { req.traceId = 'route-trace'; next(); }, express.raw({ type: () => true, limit: '2kb' }), (req: any, _res: any, next: any) => { req.rawBody = req.body; next(); });
    app.use('/api/sms/webhook', (error: any, _req: any, res: any, next: any) => {
      if (error?.type === 'entity.too.large') { res.status(413).json({ error: 'Payload too large' }); return; }
      next(error);
    });
    app.use(express.json({ verify: (req: any, _res: any, body: Buffer) => { req.rawBody = Buffer.from(body); } }));
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  it('requires the agreed shared secret for the compatibility dispatch route', async () => {
    await request(app.getHttpServer()).post('/api/sms/dispatch').send({ to: '+639171234567', message: 'hi' }).expect(401);
    sms.dispatch.mockResolvedValueOnce({ success: true });
    await request(app.getHttpServer()).post('/api/sms/dispatch')
      .set('x-sms-dispatch-secret', 'dispatch-secret')
      .send({ to: '+639171234567', message: 'hi' }).expect(200, { success: true });
  });

  it('checks the exact signed webhook bytes and passes the bounded raw body to the handler', async () => {
    const raw = '{ "event":"MESSAGE_RECEIVED", "data":{"sender":"+639171234567","message":"voucher"} }';
    const signature = createHmac('sha256', 'webhook-secret').update(raw).digest('hex');
    sms.processWebhook.mockResolvedValueOnce({ success: true, status: 'Buffered', traceId: 'route-trace' });
    await request(app.getHttpServer()).post('/api/sms/webhook').type('application/json').set('x-signature', signature).send(raw)
      .expect(200, { success: true, status: 'Buffered', traceId: 'route-trace' });
    expect(sms.processWebhook).toHaveBeenCalledWith(Buffer.from(raw), 'route-trace');
    await request(app.getHttpServer()).post('/api/sms/webhook').type('application/json').set('x-signature', signature).send(`${raw} `).expect(401);
  });

  it('rejects webhook bodies above 2 KB before handler execution', async () => {
    sms.processWebhook.mockClear();
    await request(app.getHttpServer()).post('/api/sms/webhook').type('application/json').send(`{"payload":"${'x'.repeat(2100)}"}`).expect(413);
    expect(sms.processWebhook).not.toHaveBeenCalled();
  });
});
