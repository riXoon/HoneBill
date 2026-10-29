import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { configureRequestBodyParsing } from './common/middleware/request-body.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
  });

  app.set('trust proxy', 1);
  configureRequestBodyParsing(app);
  configureApp(app);

  const port = process.env.PORT || 3000;
  await app.listen(port);
}

void bootstrap();
