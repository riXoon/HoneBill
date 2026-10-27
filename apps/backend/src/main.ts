import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type Request } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: true,
  });

  // Raw text for POST /api/auth when content type isn't json/form/multipart.
  // Must be registered BEFORE configureApp and BEFORE listen().
app.use(
  '/api/auth',
  express.text({
    type: (req) => {
      const r = req as Request;
      if (r.method !== 'POST') return false;
      const path = String(r.originalUrl ?? '').split('?')[0].replace(/\/+$/, '');
      if (path !== '/api/auth') return false;
      const ct = String(r.headers['content-type'] ?? '').toLowerCase();
      return !/(urlencoded|multipart\/form-data)/.test(ct);
    },
  }),
);

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

app.enableCors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: 'GET, POST, OPTIONS',
  allowedHeaders: 'Content-Type, Authorization, X-Signature,X-Textbee-Signature',
});

  // Non-strict JSON so `null` and `"x"` parse instead of eing rejected.
  app.useBodyParser('json', { strict: false });

  configureApp(app);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  Logger.log(`Application successfully started on port ${port}`, 'Bootstrap');
}
bootstrap();