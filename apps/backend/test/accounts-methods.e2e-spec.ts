import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LegacyHttpExceptionFilter } from '../src/common/filters/legacy-http-exception.filter.js';
import { AccountsController } from '../src/modules/accounts/accounts.controller.js';
import { AccountsService } from '../src/modules/accounts/accounts.service.js';

describe('/api/users/check unsupported methods (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        {
          provide: AccountsService,
          useValue: { checkUser: jest.fn(), lookupUser: jest.fn(), register: jest.fn() },
        },
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
    const response = await request(app.getHttpServer()).put('/api/users/check');
    expect(response.status).toBe(405);
    expect(response.text).toBe('');
  });
});
