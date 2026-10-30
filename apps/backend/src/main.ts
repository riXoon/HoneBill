import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import express, { type Request } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: true,
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

  app.useBodyParser('json', { strict: false });
  configureApp(app);
  const port = process.env.PORT || 3000;
  await app.listen(port);
}

bootstrap();
