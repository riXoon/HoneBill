import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import express, { type Request } from 'express';
import { randomUUID } from 'node:crypto';

/** Starts Nest with bounded raw SMS webhook parsing before the regular JSON body parser. */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Capture signed TextBee bytes before parsing; cap memory use at the legacy 2 KB limit.
  app.use('/api/sms/webhook', (req: any, _res: any, next: any) => {
    if (req.method === 'POST') req.traceId = randomUUID();
    next();
  }, express.raw({ type: () => true, limit: '2kb' }), (req: any, _res: any, next: any) => {
    if (req.method === 'POST' && Buffer.isBuffer(req.body)) req.rawBody = req.body;
    next();
  });
  app.use('/api/sms/webhook', (error: any, req: any, res: any, next: any) => {
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Payload too large', traceId: req.traceId ?? randomUUID() });
      return;
    }
    next(error);
  });

  app.use('/api/auth', express.text({
    type: (req) => {
      const request = req as Request;
      if (request.method !== 'POST') return false;
      const path = String(request.originalUrl ?? '').split('?')[0].replace(/\/+$/, '');
      if (path !== '/api/auth') return false;
      const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
      return !/(urlencoded|multipart\/form-data)/.test(contentType);
    },
  }));

  app.use(
    '/api/auth/pin/verify',
    express.text({ type: () => true }),
    (req: any, _res: any, next: any) => {
      if (typeof req.body === 'string') {
        try { req.body = JSON.parse(req.body); } catch { req.body = null; }
      }
      next();
    },
  );

  app.use(express.json({
    strict: false,
    verify: (req: any, _res: any, body: Buffer) => {
      if (!req.rawBody) req.rawBody = Buffer.from(body);
    },
  }));
  app.use(express.urlencoded({ extended: true }));
  configureApp(app);
  const port = process.env.PORT || 3000;
  await app.listen(port);
}

bootstrap();
