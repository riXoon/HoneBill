import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';

describe('Swagger endpoint (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/api/docs-json (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('openapi');
  });

  afterEach(async () => {
    await app.close();
  });
});
