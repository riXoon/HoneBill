import { describe, expect, it, jest } from '@jest/globals';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { RedisService } from '../../infra/redis/redis.service.js';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter.js';
import { AuthService } from '../auth/auth.service.js';
import { SettlementsController } from './settlements.controller.js';
import { VoucherStatusService } from './voucher-status.service.js';

describe('VoucherStatusService', () => {
  it('scopes lookups to the wallet and distinguishes buffered, missing and terminal vouchers', async () => {
    const known = Buffer.alloc(32, 0xfb).toString('base64');
    const buffered = Buffer.alloc(32, 2).toString('base64');
    const other = Buffer.alloc(32, 3).toString('base64');
    const findMany = jest.fn(async (_query: unknown) => [{ nonce: known, status: 'FAILED', txHash: null, failReason: 'Insufficient balance.' }]);
    const findUnique = jest.fn(async (_query: unknown) => ({ shortId: 'me1234' }));
    const mget = jest.fn(async (..._keys: string[]) => ['me1234', 'other1']);
    const service = new VoucherStatusService({ account: { findUnique }, settlement: { findMany } } as unknown as PrismaService,
      { getClient: () => ({ mget }) } as unknown as RedisService);
    const urlNonce = Buffer.from(known, 'base64').toString('base64url');

    await expect(service.lookup('wallet', [urlNonce, buffered, other])).resolves.toEqual([
      { nonce: urlNonce, status: 'FAILED', reason: 'Your Offline balance was not enough for the amount plus the offline fee.' },
      { nonce: buffered, status: 'PENDING' },
      { nonce: other, status: 'NOT_FOUND' },
    ]);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { stellarPublicKey: 'wallet' } }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      nonce: { in: expect.arrayContaining([known, urlNonce, buffered, other]) },
      OR: [{ senderShortId: 'me1234' }, { receiverShortId: 'me1234' }],
    } }));
    expect(mget).toHaveBeenCalledWith(`honebill:sms:nonce:${buffered}`, `honebill:sms:nonce:${other}`);
  });

  it('requires a wallet session for status and disables the legacy submission route', async () => {
    const lookup = jest.fn(async (_subject: string, _nonces: string[]) => []);
    const module = await Test.createTestingModule({ controllers: [SettlementsController], providers: [
      { provide: VoucherStatusService, useValue: { lookup } },
      { provide: JwtService, useValue: { verifyAsync: async () => ({ sub: 'wallet' }) } },
      { provide: AuthService, useValue: { tokenIssuer: 'fixture' } },
    ] }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api/v2');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    try {
      const api = request(app.getHttpServer());
      const nonces = [Buffer.alloc(32, 1).toString('base64')];
      await api.post('/api/v2/settlements').send({ smsBody: 'signed-voucher' }).expect(409).expect(({ body }) => {
        expect(body.status).toBe('PENDING');
      });
      await api.post('/api/v2/settlements/status').send({ nonces }).expect(401);
      await api.post('/api/v2/settlements/status').set('Authorization', 'Bearer fixture').send({ nonces: ['short-reference'] }).expect(400);
      await api.post('/api/v2/settlements/status').set('Authorization', 'Bearer fixture').send({ nonces }).expect(200, { vouchers: [] });
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(lookup).toHaveBeenCalledWith('wallet', nonces);
    } finally {
      await app.close();
    }
  });
});
