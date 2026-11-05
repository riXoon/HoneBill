import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { configureRequestBodyParsing } from './common/middleware/request-body.middleware';
import { configureSmsWebhookMiddleware } from './common/middleware/sms-webhook.middleware';

/** Starts Nest with bounded raw SMS webhook parsing before the regular JSON body parser. */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Order matters: capture bounded webhook bytes first, then parse other bodies.
  configureSmsWebhookMiddleware(app);
  configureRequestBodyParsing(app);
  configureApp(app);
  const port = process.env.PORT || 3000;
  await app.listen(port);
}

bootstrap();
