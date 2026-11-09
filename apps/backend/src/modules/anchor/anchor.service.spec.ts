import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { AnchorService } from './anchor.service.js';

describe('AnchorService', () => {
  const account = Keypair.random().publicKey();
  const configValues: Record<string, string> = {};
  const configGet = jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback);
  const config = { get: configGet } as unknown as ConfigService;
  const verifyAsync = jest.fn<JwtService['verifyAsync']>();
  const jwt = { verifyAsync } as unknown as JwtService;
  const findUnique = jest.fn<PrismaService['anchorTransaction']['findUnique']>();
  const prisma = {
    anchorTransaction: { findUnique },
  } as unknown as PrismaService;
  const redis = { getClient: () => ({ set: jest.fn() }) } as unknown as RedisService;
  let service: AnchorService;

  beforeEach(() => {
    for (const key of Object.keys(configValues)) delete configValues[key];
    configGet.mockClear();
    verifyAsync.mockReset();
    findUnique.mockReset();
    service = new AnchorService(config, jwt, prisma, redis);
  });

  describe('stellarToml', () => {
    it('publishes the network, SEP endpoints, public signing key, and assets', () => {
      const keypair = Keypair.random();
      Object.assign(configValues, {
        SECRET_SEP10_SIGNING_SEED: keypair.secret(),
        NEXT_PUBLIC_APP_URL: 'https://anchor.example/',
        PHPC_ISSUER_PUBKEY: 'GPHPC',
        USDC_ISSUER_PUBKEY: 'GUSDC',
      });

      const result = service.stellarToml();

      expect(result.status).toBe(200);
      expect(result.headers['Content-Type']).toBe('text/plain; charset=utf-8');
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.body).toContain('WEB_AUTH_ENDPOINT="https://anchor.example/api/v2/auth"');
      expect(result.body).toContain(`SIGNING_KEY="${keypair.publicKey()}"`);
      expect(result.body).toContain('TRANSFER_SERVER_SEP0024="https://anchor.example/api/v2/sep24"');
      expect(result.body).toContain('issuer="GPHPC"');
      expect(result.body).toContain('issuer="GUSDC"');
      expect(result.body).not.toContain(keypair.secret());
    });

    it('returns a plain-text configuration error when the signing seed is missing', () => {
      configValues.NEXT_PUBLIC_APP_URL = 'https://anchor.example';

      const result = service.stellarToml();

      expect(result.status).toBe(500);
      expect(result.body).toContain('SECRET_SEP10_SIGNING_SEED');
      expect(result.headers['Content-Type']).toBe('text/plain; charset=utf-8');
    });
  });

  describe('sep24Info', () => {
    it('advertises the two assets, default caps, and fee behavior', () => {
      expect(service.sep24Info()).toEqual({
        deposit: { PHPC: { enabled: true, max_amount: 5000 }, USDC: { enabled: true, max_amount: 100 } },
        withdraw: { PHPC: { enabled: true, max_amount: 5000 }, USDC: { enabled: true, max_amount: 100 } },
        fee: { enabled: false },
      });
    });

    it('applies ramp and per-action kill switches', () => {
      Object.assign(configValues, { RAMP_ENABLED: 'true', DEPOSIT_ENABLED: 'false' });
      expect(service.sep24Info().deposit.PHPC.enabled).toBe(false);
      expect(service.sep24Info().withdraw.PHPC.enabled).toBe(true);

      configValues.RAMP_ENABLED = 'false';
      expect(service.sep24Info().withdraw.USDC.enabled).toBe(false);
    });
  });

  describe('sep24Transaction', () => {
    beforeEach(() => {
      configValues.SECRET_SEP10_JWT_SECRET = 'test-secret';
      verifyAsync.mockResolvedValue({ sub: account });
    });

    it('requires a valid SEP-10 bearer token and transaction id', async () => {
      await expect(service.sep24Transaction(undefined, 'tx-id')).rejects.toMatchObject({
        status: 401,
        responseBody: { error: 'Unauthorized', message: 'A valid SEP-10 bearer token is required.' },
      });
      await expect(service.sep24Transaction('Bearer valid', undefined)).rejects.toMatchObject({
        status: 400,
        responseBody: { error: 'Bad Request', message: "Missing required query parameter: 'id'" },
      });
      expect(verifyAsync).toHaveBeenCalledWith('valid', {
        secret: 'test-secret',
        algorithms: ['HS256'],
      });
    });

    it.each([
      ['missing', null],
      ['owned by another account', { id: 'tx-id', stellarAccount: Keypair.random().publicKey() }],
    ])('returns the same 404 when the transaction is %s', async (_label, record) => {
      findUnique.mockResolvedValue(record as never);

      await expect(service.sep24Transaction('Bearer valid', 'tx-id')).rejects.toMatchObject({
        status: 404,
        responseBody: { error: 'Not Found', message: 'Transaction not found.' },
      });
    });

    it('returns SEP-24 fields for an owned withdrawal, including treasury routing details', async () => {
      const createdAt = new Date('2026-01-02T03:04:05.000Z');
      const updatedAt = new Date('2026-01-02T04:05:06.000Z');
      findUnique.mockResolvedValue({
        id: 'tx-id',
        stellarAccount: account,
        type: 'withdrawal',
        status: 'pending_external',
        assetCode: 'PHPC',
        amountIn: '25.00',
        amountOut: '24.00',
        amountFee: '1.00',
        memo: 'memo-value',
        memoType: 'id',
        createdAt,
        updatedAt,
      } as never);
      configValues.TREASURY_PUBLIC_KEY = ' G-TREASURY ';

      await expect(service.sep24Transaction('Bearer valid', 'tx-id')).resolves.toEqual({
        transaction: {
          id: 'tx-id',
          kind: 'withdrawal',
          status: 'pending_external',
          amount_in: '25.00',
          amount_out: '24.00',
          amount_fee: '1.00',
          stellar_account: account,
          asset_code: 'PHPC',
          started_at: createdAt.toISOString(),
          updated_at: updatedAt.toISOString(),
          memo: 'memo-value',
          memo_type: 'id',
          withdraw_anchor_account: 'G-TREASURY',
          withdraw_memo: 'memo-value',
          withdraw_memo_type: 'id',
        },
      });
      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'tx-id' } });
    });
  });
});
