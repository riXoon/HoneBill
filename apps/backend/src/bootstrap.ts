import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Response } from 'express';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');

  app.setGlobalPrefix('api', {
    exclude: [{ path: '.well-known/(.*)', method: RequestMethod.ALL }],
  });

  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Signature',
      'X-Textbee-Signature',
      'X-Textbee-Timestamp',
      'X-Timestamp',
      'X-Sms-Dispatch-Secret',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HoneBill Backend API')
    .setDescription('NestJS migration backend API')
    .setVersion('1.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const express = app.getHttpAdapter().getInstance();
  express.get('/api/swagger', (_req: unknown, res: Response) => {
    res.json(document);
  });
}
