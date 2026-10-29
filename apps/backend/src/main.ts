import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureRequestBodyParsing } from './common/middleware/request-body.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    // Install parsers below so OTP can turn malformed JSON into an empty body
    // before Express's JSON parser rejects the request.
    bodyParser: false,
  });
  app.set('trust proxy', 1);
app.setGlobalPrefix('api'); // keeps your /api/wallet/balance URL
app.useGlobalPipes(new ValidationPipe({ transform: true }));

  configureRequestBodyParsing(app);
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: 'GET, POST, OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Signature, X-Textbee-Signature',
  });

  configureApp(app);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  Logger.log(`Application successfully started on port ${port}`, 'Bootstrap');
}
bootstrap();
