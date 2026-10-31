import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter.js';
import { AccountsController } from '../../src/modules/accounts/accounts.controller.js';
import { AccountsService } from '../../src/modules/accounts/accounts.service.js';

describe('accounts unsupported methods (e2e)', () => {
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
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const unsupported: Array<[string, Array<'get' | 'post' | 'put' | 'patch' | 'delete'>]> = [
    ['/api/register', ['get', 'put', 'patch', 'delete']],
    ['/api/users/check', ['post', 'put', 'patch', 'delete']],
    ['/api/users/lookup', ['post', 'put', 'patch', 'delete']],
  ];

  it.each(unsupported)('%s returns an empty 405 for every unsupported method', async (path, methods) => {
    for (const method of methods) {
      const response = await request(app.getHttpServer())[method](path);
      expect(response.status).toBe(405);
      expect(response.text).toBe('');
    }
  });
});
