import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Account, Horizon, Keypair } from '@stellar/stellar-sdk';
import request from 'supertest';
import { configureApp } from '../../src/bootstrap.js';
import { configureRequestBodyParsing } from '../../src/common/middleware/request-body.middleware.js';
import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import { RedisService } from '../../src/infra/redis/redis.service.js';
import { AnchorController } from '../../src/modules/anchor/anchor.controller.js';
import { AnchorService } from '../../src/modules/anchor/anchor.service.js';

const TEST_SECRET = 'anchor-sep10-e2e-test-secret';
const INTERACTIVE_SECRET = 'anchor-interactive-url-e2e-secret';
const signer = Keypair.random();
const account = Keypair.random().publicKey();
const create = jest.fn<PrismaService['anchorTransaction']['create']>();
const findUnique = jest.fn<PrismaService['anchorTransaction']['findUnique']>();
const findFirst = jest.fn<PrismaService['anchorTransaction']['findFirst']>();
const findMany = jest.fn<PrismaService['anchorTransaction']['findMany']>();
const updateMany = jest.fn<PrismaService['anchorTransaction']['updateMany']>();
const update = jest.fn<PrismaService['anchorTransaction']['update']>();
const upsert = jest.fn<PrismaService['anchorTransaction']['upsert']>();
const redisSet = jest.fn().mockResolvedValue('OK');
const configValues: Record<string, string> = {
  SECRET_SEP10_SIGNING_SEED: signer.secret(),
  NEXT_PUBLIC_APP_URL: 'https://anchor.example',
  SECRET_SEP10_JWT_SECRET: TEST_SECRET,
  SECRET_SEP24_INTERACTIVE_URL_JWT_SECRET: INTERACTIVE_SECRET,
  TREASURY_PUBLIC_KEY: 'GTESTTREASURY',
  PHPC_ISSUER_PUBKEY: 'GTESTPHPCISSUER',
  USDC_ISSUER_PUBKEY: 'GTESTUSDCISSUER',
  RAMP_ENABLED: 'true',
  DEPOSIT_ENABLED: 'true',
  WITHDRAW_ENABLED: 'true',
};
const configGet = jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback);

describe('Anchor routes (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: TEST_SECRET, signOptions: { algorithm: 'HS256' } })],
      controllers: [AnchorController],
      providers: [
        AnchorService,
        { provide: ConfigService, useValue: { get: configGet } },
        { provide: PrismaService, useValue: { anchorTransaction: { create, findUnique, findFirst, findMany, updateMany, update, upsert } } },
        { provide: RedisService, useValue: { getClient: () => ({ set: redisSet }) } },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    configureRequestBodyParsing(app as never);
    configureApp(app);
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    create.mockReset();
    findUnique.mockReset();
    findFirst.mockReset();
    findMany.mockReset().mockResolvedValue([] as never);
    updateMany.mockReset();
    update.mockReset();
    upsert.mockReset();
    redisSet.mockReset().mockResolvedValue('OK');
    configValues.RAMP_ENABLED = 'true';
    configValues.DEPOSIT_ENABLED = 'true';
    configValues.WITHDRAW_ENABLED = 'true';
    delete configValues.STELLAR_NETWORK_PASSPHRASE;
    delete configValues.RAMP_MAX_PER_TX_PHPC;
    delete configValues.RAMP_DAILY_MAX_PER_USER_PHPC;
    delete configValues.PHPC_DISTRIBUTOR_SECRET;
  });

  it('GET /.well-known/stellar.toml serves the SEP-1 document outside the /api prefix', async () => {
    const response = await request(app.getHttpServer())
      .get('/.well-known/stellar.toml')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['cache-control']).toBe('public, max-age=3600, stale-while-revalidate=600');
    expect(response.text).toContain('WEB_AUTH_ENDPOINT="https://anchor.example/api/auth"');
    expect(response.text).toContain(`SIGNING_KEY="${signer.publicKey()}"`);
    expect(response.text).toContain('TRANSFER_SERVER_SEP0024="https://anchor.example/api/sep24"');
  });

  it('OPTIONS /.well-known/stellar.toml returns the exact SEP-1 CORS preflight response', async () => {
    const response = await request(app.getHttpServer())
      .options('/.well-known/stellar.toml')
      .set('Origin', 'https://wallet.example')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toBe('GET, OPTIONS');
    expect(response.headers['access-control-allow-headers']).toBe('*');
    expect(response.text ?? '').toBe('');
  });

  it('GET /api/sep24/info serves public capabilities with the expected cache and CORS headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/sep24/info')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['cache-control']).toBe('public, max-age=300, stale-while-revalidate=60');
    expect(response.body).toEqual({
      deposit: { PHPC: { enabled: true, max_amount: 5000 }, USDC: { enabled: true, max_amount: 100 } },
      withdraw: { PHPC: { enabled: true, max_amount: 5000 }, USDC: { enabled: true, max_amount: 100 } },
      fee: { enabled: false },
    });
  });

  it('GET /api/sep24/info reflects the deposit and withdrawal kill switches', async () => {
    configValues.DEPOSIT_ENABLED = 'false';
    configValues.WITHDRAW_ENABLED = 'false';
    const response = await request(app.getHttpServer()).get('/api/sep24/info').expect(200);
    expect(response.body.deposit.PHPC.enabled).toBe(false);
    expect(response.body.withdraw.USDC.enabled).toBe(false);
  });

  it('GET /api/sep24/transaction rejects missing SEP-10 authentication with the legacy body', async () => {
    await request(app.getHttpServer())
      .get('/api/sep24/transaction')
      .query({ id: 'tx-1' })
      .expect(401, {
        error: 'Unauthorized',
        message: 'A valid SEP-10 bearer token is required.',
      });
  });

  it('GET /api/sep24/transaction requires id after authenticating', async () => {
    const token = await jwt.signAsync({ sub: account });
    await request(app.getHttpServer()).get('/api/sep24/transaction')
      .set('Authorization', `Bearer ${token}`)
      .expect(400, { error: 'Bad Request', message: "Missing required query parameter: 'id'" });
  });

  it('GET /api/sep24/transaction returns SEP-24 fields for the authenticated owner', async () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    const updatedAt = new Date('2026-01-02T04:05:06.000Z');
    findUnique.mockResolvedValue({
      id: 'tx-1',
      stellarAccount: account,
      type: 'withdrawal',
      status: 'pending_external',
      assetCode: 'PHPC',
      amountIn: '25.00',
      amountOut: '24.00',
      amountFee: '1.00',
      memo: 'return-memo',
      memoType: 'id',
      createdAt,
      updatedAt,
    } as never);
    const token = await jwt.signAsync({ sub: account });

    await request(app.getHttpServer())
      .get('/api/sep24/transaction')
      .query({ id: 'tx-1' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200, {
        transaction: {
          id: 'tx-1',
          kind: 'withdrawal',
          status: 'pending_external',
          amount_in: '25.00',
          amount_out: '24.00',
          amount_fee: '1.00',
          stellar_account: account,
          asset_code: 'PHPC',
          started_at: createdAt.toISOString(),
          updated_at: updatedAt.toISOString(),
          memo: 'return-memo',
          memo_type: 'id',
          withdraw_anchor_account: 'GTESTTREASURY',
          withdraw_memo: 'return-memo',
          withdraw_memo_type: 'id',
        },
      });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'tx-1' } });
  });

  it('GET /api/sep24/transaction hides another account’s transaction behind 404', async () => {
    findUnique.mockResolvedValue({
      id: 'tx-foreign',
      stellarAccount: Keypair.random().publicKey(),
    } as never);
    const token = await jwt.signAsync({ sub: account });

    await request(app.getHttpServer())
      .get('/api/sep24/transaction')
      .query({ id: 'tx-foreign' })
      .set('Authorization', `Bearer ${token}`)
      .expect(404, { error: 'Not Found', message: 'Transaction not found.' });
  });

  it('initiates a deposit and returns a 15-minute HS256 JWT bound to its account and transaction', async () => {
    create.mockResolvedValue({ id: 'deposit-e2e-1' } as never);
    const sep10 = await jwt.signAsync({ sub: account });
    const response = await request(app.getHttpServer())
      .post('/api/sep24/transactions/deposit/interactive')
      .set('Authorization', `Bearer ${sep10}`)
      .send({ asset_code: 'phpc', memo: 'memo-1', memo_type: 'text' })
      .expect(200);
    const url = new URL(response.body.url);
    const payload = await jwt.verifyAsync<{ sub: string; transaction_id: string; iat: number; exp: number }>(
      url.searchParams.get('token')!, { secret: INTERACTIVE_SECRET, algorithms: ['HS256'] },
    );
    expect(response.body).toMatchObject({ type: 'interactive_customer_info_needed', id: 'deposit-e2e-1' });
    expect(url.pathname).toBe('/deposit');
    expect(url.searchParams.get('transaction_id')).toBe('deposit-e2e-1');
    expect(payload).toMatchObject({ sub: account, transaction_id: 'deposit-e2e-1' });
    expect(payload.exp - payload.iat).toBe(900);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      stellarAccount: account, type: 'deposit', status: 'incomplete', assetCode: 'PHPC', memo: 'memo-1', memoType: 'text',
    }) });
  });

  it('preserves SEP-10 authentication and unsupported asset errors for interactive initiation', async () => {
    await request(app.getHttpServer()).post('/api/sep24/transactions/deposit/interactive')
      .send({ asset_code: 'PHPC' })
      .expect(401, { error: 'Unauthorized', message: 'A valid SEP-10 bearer token is required.' });
    const sep10 = await jwt.signAsync({ sub: account });
    await request(app.getHttpServer()).post('/api/sep24/transactions/withdraw/interactive')
      .set('Authorization', `Bearer ${sep10}`)
      .send({ asset_code: 'BTC' })
      .expect(400, { error: 'invalid_request', message: 'asset_code must be PHPC or USDC.' });
  });

  it('maps malformed interactive initiation JSON to the legacy validation response', async () => {
    const sep10 = await jwt.signAsync({ sub: account });
    await request(app.getHttpServer()).post('/api/sep24/transactions/deposit/interactive')
      .set('Authorization', `Bearer ${sep10}`)
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400, { error: 'Bad Request', message: "Missing required field: 'asset_code'" });
  });

  it('initiates a withdrawal and returns the short-lived signed withdrawal URL', async () => {
    create.mockResolvedValue({ id: 'withdraw-e2e-1' } as never);
    const sep10 = await jwt.signAsync({ sub: account });
    const response = await request(app.getHttpServer())
      .post('/api/sep24/transactions/withdraw/interactive')
      .set('Authorization', `Bearer ${sep10}`)
      .send({ asset_code: ' usdc ' })
      .expect(200);
    const url = new URL(response.body.url);
    const payload = await jwt.verifyAsync<{ sub: string; transaction_id: string; iat: number; exp: number }>(
      url.searchParams.get('token')!, { secret: INTERACTIVE_SECRET, algorithms: ['HS256'] },
    );
    expect(url.pathname).toBe('/withdraw');
    expect(payload).toMatchObject({ sub: account, transaction_id: 'withdraw-e2e-1' });
    expect(payload.exp - payload.iat).toBe(900);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      stellarAccount: account, type: 'withdrawal', status: 'incomplete', assetCode: 'USDC',
    }) });
  });

  it('accepts the URL-encoded and multipart form bodies supported by the legacy initiation routes', async () => {
    const sep10 = await jwt.signAsync({ sub: account });
    create.mockResolvedValue({ id: 'form-deposit' } as never);
    await request(app.getHttpServer()).post('/api/sep24/transactions/deposit/interactive')
      .set('Authorization', `Bearer ${sep10}`)
      .type('form').send({ asset_code: 'PHPC', memo_type: 'text' }).expect(200);
    create.mockResolvedValue({ id: 'multipart-withdraw' } as never);
    await request(app.getHttpServer()).post('/api/sep24/transactions/withdraw/interactive')
      .set('Authorization', `Bearer ${sep10}`)
      .field('asset_code', 'USDC').expect(200);
  });

  it('submits a valid withdrawal and stores the expected state, amount, and text memo', async () => {
    findUnique.mockResolvedValue({ assetCode: 'PHPC', stellarAccount: account } as never);
    updateMany.mockResolvedValue({ count: 1 } as never);
    const interactive = await jwt.signAsync({ sub: account, transaction_id: 'withdraw-submit-1' }, {
      secret: INTERACTIVE_SECRET, algorithm: 'HS256', expiresIn: 900,
    });
    await request(app.getHttpServer()).post('/api/anchor/submit-withdraw')
      .set('Authorization', `Bearer ${interactive}`)
      .send({ transaction_id: 'withdraw-submit-1', amount: '125.50', gcash_number: '+63 9-123-456-789' })
      .expect(200, { success: true });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'withdraw-submit-1', stellarAccount: account, type: 'withdrawal', status: 'incomplete' }),
      data: expect.objectContaining({ status: 'pending_user_transfer_start', amountIn: '125.50', memoType: 'text' }),
    }));
  });

  it('rejects invalid withdrawal amount, session transaction mismatch, and invalid JWT', async () => {
    const interactive = await jwt.signAsync({ sub: account, transaction_id: 'withdraw-submit-2' }, {
      secret: INTERACTIVE_SECRET, algorithm: 'HS256', expiresIn: 900,
    });
    await request(app.getHttpServer()).post('/api/anchor/submit-withdraw')
      .set('Authorization', `Bearer ${interactive}`)
      .send({ transaction_id: 'withdraw-submit-2', amount: '1.00000000', gcash_number: '09123456789' })
      .expect(400, { success: false, error: 'amount must be positive and have at most 7 decimal places.' });
    await request(app.getHttpServer()).post('/api/anchor/submit-withdraw')
      .set('Authorization', `Bearer ${interactive}`)
      .send({ transaction_id: 'other-id', amount: '1', gcash_number: '09123456789' })
      .expect(403, { success: false, error: 'The transaction does not match this signed session.' });
    await request(app.getHttpServer()).post('/api/anchor/submit-withdraw')
      .set('Authorization', 'Bearer not-a-jwt')
      .send({})
      .expect(401, { success: false, error: 'This withdrawal session is invalid or has expired.' });
    const missingClaim = await jwt.signAsync({ sub: account }, { secret: INTERACTIVE_SECRET, algorithm: 'HS256' });
    await request(app.getHttpServer()).post('/api/anchor/submit-withdraw')
      .set('Authorization', `Bearer ${missingClaim}`)
      .send({ transaction_id: 'withdraw-submit-2', amount: '1', gcash_number: '09123456789' })
      .expect(401, { success: false, error: 'This withdrawal session is invalid or has expired.' });
    const wrongSignature = await jwt.signAsync({ sub: account, transaction_id: 'withdraw-submit-2' }, {
      secret: 'different-secret', algorithm: 'HS256', expiresIn: 900,
    });
    await request(app.getHttpServer()).post('/api/anchor/submit-withdraw')
      .set('Authorization', `Bearer ${wrongSignature}`)
      .send({ transaction_id: 'withdraw-submit-2', amount: '1', gcash_number: '09123456789' })
      .expect(401, { success: false, error: 'This withdrawal session is invalid or has expired.' });
    const expired = await jwt.signAsync({ sub: account, transaction_id: 'withdraw-submit-2' }, {
      secret: INTERACTIVE_SECRET, algorithm: 'HS256', expiresIn: -1,
    });
    await request(app.getHttpServer()).post('/api/anchor/submit-withdraw')
      .set('Authorization', `Bearer ${expired}`)
      .send({ transaction_id: 'withdraw-submit-2', amount: '1', gcash_number: '09123456789' })
      .expect(401, { success: false, error: 'This withdrawal session is invalid or has expired.' });
  });

  it('applies the per-transaction withdrawal cap', async () => {
    configValues.RAMP_MAX_PER_TX_PHPC = '100';
    findUnique.mockResolvedValue({ assetCode: 'PHPC', stellarAccount: account } as never);
    const interactive = await jwt.signAsync({ sub: account, transaction_id: 'withdraw-cap-1' }, {
      secret: INTERACTIVE_SECRET, algorithm: 'HS256', expiresIn: 900,
    });
    const response = await request(app.getHttpServer()).post('/api/anchor/submit-withdraw')
      .set('Authorization', `Bearer ${interactive}`)
      .send({ transaction_id: 'withdraw-cap-1', amount: '101', gcash_number: '09123456789' })
      .expect(400);
    expect(response.body.error).toMatch(/exceeds the maximum limit/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('applies daily withdrawal limits and validates normalized GCash numbers', async () => {
    configValues.RAMP_DAILY_MAX_PER_USER_PHPC = '10';
    findUnique.mockResolvedValue({ assetCode: 'PHPC', stellarAccount: account } as never);
    findMany.mockResolvedValue([{ amountIn: '8', amountOut: null }] as never);
    const interactive = await jwt.signAsync({ sub: account, transaction_id: 'withdraw-daily-1' }, {
      secret: INTERACTIVE_SECRET, algorithm: 'HS256', expiresIn: 900,
    });
    const limited = await request(app.getHttpServer()).post('/api/anchor/submit-withdraw')
      .set('Authorization', `Bearer ${interactive}`)
      .send({ transaction_id: 'withdraw-daily-1', amount: '3', gcash_number: '09123456789' })
      .expect(400);
    expect(limited.body.error).toMatch(/Daily limit/);
    expect(updateMany).not.toHaveBeenCalled();

    findMany.mockResolvedValue([] as never);
    const invalidPhone = await request(app.getHttpServer()).post('/api/anchor/submit-withdraw')
      .set('Authorization', `Bearer ${interactive}`)
      .send({ transaction_id: 'withdraw-daily-1', amount: '3', gcash_number: '12345' })
      .expect(400);
    expect(invalidPhone.body.error).toMatch(/gcash_number must be a valid/);
  });

  it('enforces ramp kill switches on interactive actions', async () => {
    configValues.WITHDRAW_ENABLED = 'false';
    const sep10 = await jwt.signAsync({ sub: account });
    await request(app.getHttpServer()).post('/api/sep24/transactions/withdraw/interactive')
      .set('Authorization', `Bearer ${sep10}`)
      .send({ asset_code: 'PHPC' })
      .expect(503, { code: 'RAMP_LOCKED', error: 'Withdrawals are temporarily disabled for maintenance.' });
    configValues.WITHDRAW_ENABLED = 'true';
    configValues.RAMP_ENABLED = 'false';
    await request(app.getHttpServer()).post('/api/anchor/simulate-payment')
      .send({ transaction_id: 'mock-disabled', amount: '1' })
      .expect(503, { code: 'RAMP_LOCKED', error: 'On/Off Ramp is temporarily disabled for maintenance.' });
  });

  it('confirms pending_external withdrawals idempotently', async () => {
    findFirst.mockResolvedValue({ status: 'pending_external' } as never);
    const sep10 = await jwt.signAsync({ sub: account });
    await request(app.getHttpServer()).post('/api/anchor/confirm-withdraw')
      .set('Authorization', `Bearer ${sep10}`)
      .send({ transaction_id: 'withdraw-confirm-1', stellar_transaction_id: 'a'.repeat(64) })
      .expect(200, { success: true, status: 'pending_external' });
  });

  it('verifies a matching Testnet withdrawal payment before advancing state', async () => {
    findFirst.mockResolvedValue({
      status: 'pending_user_transfer_start', amountIn: '1.25', memo: 'withdraw-memo', assetCode: 'PHPC',
    } as never);
    updateMany.mockResolvedValue({ count: 1 } as never);
    const issuer = Keypair.random().publicKey();
    configValues.PHPC_ISSUER_PUBKEY = issuer;
    const transactionsSpy = jest.spyOn(Horizon.Server.prototype, 'transactions').mockReturnValue({
      transaction: () => ({ call: async () => ({ successful: true, source_account: account, memo_type: 'text', memo: 'withdraw-memo' }) }),
    } as never);
    const operationsSpy = jest.spyOn(Horizon.Server.prototype, 'operations').mockReturnValue({
      forTransaction: () => ({ limit: () => ({ call: async () => ({ records: [{
        type: 'payment', from: account, to: 'GTESTTREASURY', asset_type: 'credit_alphanum4',
        asset_code: 'PHPC', asset_issuer: issuer, amount: '1.2500000',
      }] }) }) }),
    } as never);
    try {
      const sep10 = await jwt.signAsync({ sub: account });
      await request(app.getHttpServer()).post('/api/anchor/confirm-withdraw')
        .set('Authorization', `Bearer ${sep10}`)
        .send({ transaction_id: 'withdraw-confirm-valid', stellar_transaction_id: 'b'.repeat(64) })
        .expect(200, { success: true, status: 'pending_external' });
      expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'pending_external' } }));
    } finally {
      transactionsSpy.mockRestore();
      operationsSpy.mockRestore();
    }
  });

  it('returns 422 and does not change state when the Testnet payment does not match', async () => {
    findFirst.mockResolvedValue({
      status: 'pending_user_transfer_start', amountIn: '1.25', memo: 'expected-memo', assetCode: 'PHPC',
    } as never);
    const issuer = Keypair.random().publicKey();
    configValues.PHPC_ISSUER_PUBKEY = issuer;
    const transactionsSpy = jest.spyOn(Horizon.Server.prototype, 'transactions').mockReturnValue({
      transaction: () => ({ call: async () => ({ successful: true, source_account: account, memo_type: 'text', memo: 'wrong-memo' }) }),
    } as never);
    const operationsSpy = jest.spyOn(Horizon.Server.prototype, 'operations').mockReturnValue({
      forTransaction: () => ({ limit: () => ({ call: async () => ({ records: [{
        type: 'payment', from: account, to: 'GTESTTREASURY', asset_type: 'credit_alphanum4',
        asset_code: 'PHPC', asset_issuer: issuer, amount: '1.2500000',
      }] }) }) }),
    } as never);
    try {
      const sep10 = await jwt.signAsync({ sub: account });
      await request(app.getHttpServer()).post('/api/anchor/confirm-withdraw')
        .set('Authorization', `Bearer ${sep10}`)
        .send({ transaction_id: 'withdraw-confirm-mismatch', stellar_transaction_id: 'c'.repeat(64) })
        .expect(422, { success: false, error: 'The Stellar payment does not match this withdrawal.' });
      expect(updateMany).not.toHaveBeenCalled();
    } finally {
      transactionsSpy.mockRestore();
      operationsSpy.mockRestore();
    }
  });

  it('rejects confirmation without SEP-10 auth or with an invalid Stellar transaction hash', async () => {
    await request(app.getHttpServer()).post('/api/anchor/confirm-withdraw')
      .send({ transaction_id: 'withdraw-confirm-1', stellar_transaction_id: 'bad' })
      .expect(401, { success: false, error: 'A valid SEP-10 token is required.' });
    const sep10 = await jwt.signAsync({ sub: account });
    await request(app.getHttpServer()).post('/api/anchor/confirm-withdraw')
      .set('Authorization', `Bearer ${sep10}`)
      .send({ transaction_id: 'withdraw-confirm-1', stellar_transaction_id: 'bad' })
      .expect(400, { success: false, error: 'Valid transaction IDs are required.' });
  });

  it('maps malformed JSON for submit, confirm, and simulate routes to legacy error bodies', async () => {
    const sep10 = await jwt.signAsync({ sub: account });
    const interactive = await jwt.signAsync({ sub: account, transaction_id: 'withdraw-malformed' }, {
      secret: INTERACTIVE_SECRET, algorithm: 'HS256', expiresIn: 900,
    });
    await request(app.getHttpServer()).post('/api/anchor/submit-withdraw')
      .set('Authorization', `Bearer ${interactive}`).set('Content-Type', 'application/json').send('{bad')
      .expect(400, { success: false, error: 'The request body must be valid JSON.' });
    await request(app.getHttpServer()).post('/api/anchor/confirm-withdraw')
      .set('Authorization', `Bearer ${sep10}`).set('Content-Type', 'application/json').send('{bad')
      .expect(400, { success: false, error: 'The request body must be valid JSON.' });
    await request(app.getHttpServer()).post('/api/anchor/simulate-payment')
      .set('Content-Type', 'application/json').send('{bad')
      .expect(400, { success: false, error: 'Invalid JSON body.' });
  });

  it('rejects simulate-payment under Mainnet configuration even when the request asks for Testnet', async () => {
    configValues.STELLAR_NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
    await request(app.getHttpServer()).post('/api/anchor/simulate-payment')
      .send({ transaction_id: 'mock-client-value', amount: '2', network: 'testnet', token: 'ignored' })
      .expect(503, { success: false, error: 'This endpoint is only available on Stellar Testnet.' });
  });

  it('requires an interactive JWT for a non-mock simulate-payment request', async () => {
    await request(app.getHttpServer()).post('/api/anchor/simulate-payment')
      .send({ transaction_id: 'deposit-no-token', amount: '5', network: 'testnet' })
      .expect(401, { success: false, error: 'Unauthorized: missing SEP-24 interactive token.' });
  });

  it('rejects missing and non-positive simulate-payment amounts before touching persistence', async () => {
    await request(app.getHttpServer()).post('/api/anchor/simulate-payment')
      .send({ transaction_id: 'deposit-invalid', amount: '0' })
      .expect(400, { success: false, error: 'Amount must be a positive number.' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('submits a token-authenticated Testnet deposit and updates the anchor transaction', async () => {
    const distributor = Keypair.random();
    const issuer = Keypair.random().publicKey();
    configValues.PHPC_DISTRIBUTOR_SECRET = distributor.secret();
    configValues.PHPC_ISSUER_PUBKEY = issuer;
    findUnique.mockResolvedValue({
      id: 'deposit-settle-1', stellarAccount: account, assetCode: 'PHPC', type: 'deposit', status: 'incomplete',
      amountIn: null, amountOut: null, amountFee: null, memo: null, memoType: null,
    } as never);
    updateMany.mockResolvedValue({ count: 1 } as never);
    update.mockResolvedValue({} as never);
    redisSet.mockRejectedValueOnce(new Error('Redis unavailable'));
    const loadSpy = jest.spyOn(Horizon.Server.prototype, 'loadAccount')
      .mockResolvedValue(new Account(distributor.publicKey(), '10'));
    const submitSpy = jest.spyOn(Horizon.Server.prototype, 'submitTransaction')
      .mockResolvedValue({ hash: 'testnet-hash' } as never);
    try {
      const token = await jwt.signAsync({ sub: account, transaction_id: 'deposit-settle-1' }, {
        secret: INTERACTIVE_SECRET, algorithm: 'HS256', expiresIn: 900,
      });
      await request(app.getHttpServer()).post('/api/anchor/simulate-payment')
        .set('Authorization', `Bearer ${token}`)
        .send({ transaction_id: 'deposit-settle-1', amount: '12.5' })
        .expect(200, {
          success: true, stellar_tx_hash: 'testnet-hash', amount: '12.5000000', asset_code: 'PHPC', destination: account,
        });
      expect(redisSet).toHaveBeenCalledWith('pijin:sep24:token:used:deposit-settle-1', 'used', 'EX', 3600, 'NX');
      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'deposit-settle-1' },
        data: { status: 'completed', amountIn: '12.5000000', amountOut: '12.5000000' },
      }));
    } finally {
      loadSpy.mockRestore();
      submitSpy.mockRestore();
    }
  });

  it('keeps the legacy success response when Stellar succeeds but the final database update fails', async () => {
    const distributor = Keypair.random();
    configValues.PHPC_DISTRIBUTOR_SECRET = distributor.secret();
    configValues.PHPC_ISSUER_PUBKEY = Keypair.random().publicKey();
    findUnique.mockResolvedValue({
      id: 'deposit-db-failure-1', stellarAccount: account, assetCode: 'PHPC', type: 'deposit', status: 'incomplete',
    } as never);
    updateMany.mockResolvedValue({ count: 1 } as never);
    update.mockRejectedValue(new Error('database unavailable after submit'));
    const loadSpy = jest.spyOn(Horizon.Server.prototype, 'loadAccount')
      .mockResolvedValue(new Account(distributor.publicKey(), '10'));
    const submitSpy = jest.spyOn(Horizon.Server.prototype, 'submitTransaction')
      .mockResolvedValue({ hash: 'testnet-hash-db-failure' } as never);
    try {
      const token = await jwt.signAsync({ sub: account, transaction_id: 'deposit-db-failure-1' }, {
        secret: INTERACTIVE_SECRET, algorithm: 'HS256', expiresIn: 900,
      });
      await request(app.getHttpServer()).post('/api/anchor/simulate-payment')
        .set('Authorization', `Bearer ${token}`)
        .send({ transaction_id: 'deposit-db-failure-1', amount: '3' })
        .expect(200, {
          success: true, stellar_tx_hash: 'testnet-hash-db-failure', amount: '3.0000000', asset_code: 'PHPC', destination: account,
        });
    } finally {
      loadSpy.mockRestore();
      submitSpy.mockRestore();
    }
  });

  it('rejects replayed interactive deposit tokens before submitting a payment', async () => {
    findUnique.mockResolvedValue({
      id: 'deposit-replay-1', stellarAccount: account, assetCode: 'PHPC', type: 'deposit', status: 'incomplete',
    } as never);
    redisSet.mockResolvedValue(null);
    const token = await jwt.signAsync({ sub: account, transaction_id: 'deposit-replay-1' }, {
      secret: INTERACTIVE_SECRET, algorithm: 'HS256', expiresIn: 900,
    });
    await request(app.getHttpServer()).post('/api/anchor/simulate-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ transaction_id: 'deposit-replay-1', amount: '2' })
      .expect(409, { success: false, error: 'Interactive deposit session has already been submitted.' });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
