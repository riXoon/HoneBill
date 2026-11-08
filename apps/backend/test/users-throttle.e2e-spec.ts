import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { HttpException, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter.js';
import { AccountsController } from '../src/modules/accounts/accounts.controller.js';
import { AccountsService } from '../src/modules/accounts/accounts.service.js';

describe('users route throttles (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10_000 }])],
      controllers: [AccountsController],
      providers: [
        {
          provide: AccountsService,
          useValue: {
            checkUser: jest.fn(async () => ({ exists: false })),
            lookupUser: jest.fn(async () => {
              throw new HttpException({ found: false }, 404);
            }),
          },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v2');
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  it('check: allows 60 per minute and rejects the 61st with 429', async () => {
    for (let i = 0; i < 60; i++) {
      await request(app.getHttpServer()).get('/api/v2/users/check?phone=0917').expect(200);
    }
    const res = await request(app.getHttpServer()).get('/api/v2/users/check?phone=0917').expect(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('lookup: allows 300 per minute and rejects the 301st with 429', async () => {
    for (let i = 0; i < 300; i++) {
      await request(app.getHttpServer()).get('/api/v2/users/lookup?shortId=a').expect(404);
    }
    await request(app.getHttpServer()).get('/api/v2/users/lookup?shortId=a').expect(429);
  });
});