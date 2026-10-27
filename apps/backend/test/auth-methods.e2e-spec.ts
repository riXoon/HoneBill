import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LegacyHttpExceptionFilter } from '../src/common/filters/legacy-http-exception.filter.js';
import { AccountsService } from '../src/modules/accounts/accounts.service.js';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

describe('/api/auth unsupported methods (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { getChallenge: jest.fn(), issueToken: jest.fn() } },
        { provide: AccountsService, useValue: { verifyPin: jest.fn() } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new LegacyHttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns an empty 405 for PUT', async () => {
    const response = await request(app.getHttpServer()).put('/api/auth');
    expect(response.status).toBe(405);
    expect(response.text).toBe('');
  });

  it('returns an empty 405 for DELETE', async () => {
    const response = await request(app.getHttpServer()).delete('/api/auth');
    expect(response.status).toBe(405);
    expect(response.text).toBe('');
  });
});
