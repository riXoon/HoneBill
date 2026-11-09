import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { configureRequestBodyParsing } from './common/middleware/request-body.middleware';
import { configureSmsWebhookMiddleware } from './common/middleware/sms-webhook.middleware';

let cached: Promise<(req: Request, res: Response) => void> | undefined;

/** Builds the Nest app once per warm serverless instance, mirroring main.ts without listen(). */
function createHandler() {
  return NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  }).then(async (app) => {
    configureSmsWebhookMiddleware(app);
    configureRequestBodyParsing(app);
    configureApp(app);
    await app.init();
    return app.getHttpAdapter().getInstance() as (req: Request, res: Response) => void;
  });
}

/** Vercel entry: forwards each request to the cached Express instance. */
export default async function handler(req: Request, res: Response) {
  cached ??= createHandler().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return (await cached)(req, res);
}
