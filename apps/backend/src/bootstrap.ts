import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { API_PREFIX } from './common/api-prefix';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');

  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: '.well-known/(.*)', method: RequestMethod.ALL },
      // The public APK download page, honebill.app/download (app-version module).
      { path: 'download', method: RequestMethod.GET },
      { path: 'download/honebill.apk', method: RequestMethod.GET },
    ],
  });

  const express = app.getHttpAdapter().getInstance();
  express.options(
    '/.well-known/stellar.toml',
    (request: Request, response: Response, next: NextFunction) => {
      // Handle only this exact preflight before the global CORS middleware runs.
      if (request.path !== '/.well-known/stellar.toml') {
        next();
        return;
      }
      response
        .status(204)
        .set({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        })
        .end();
    },
  );

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
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);

  express.get(`/${API_PREFIX}/swagger`, (_req: unknown, res: Response) => {
    res.json(document);
  });
}
