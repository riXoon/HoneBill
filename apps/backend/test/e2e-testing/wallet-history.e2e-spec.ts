import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../src/bootstrap.js';
import { ApiExceptionFilter } from '../../src/common/filters/api-exception.filter.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import { StellarService } from '../../src/infra/stellar/stellar.service.js';
import { WalletModule } from '../../src/modules/wallet/wallet.module.js';

const ISSUER = 'wallet.test';
const SECRET = 'fixture-secret-for-wallet-history';
const ALICE = {
  shortId: 'alice1',
  stellarPublicKey: `G${'A'.repeat(55)}`,
  firstName: 'Alice',
};
const BOB = {
  shortId: 'bobby2',
  stellarPublicKey: `G${'B'.repeat(55)}`,
  firstName: 'Bob',
};
const UNKNOWN_WALLET = `G${'C'.repeat(55)}`;
const CREATED_AT = new Date('2026-01-04T00:00:00.000Z');
const TOKEN = { symbol: 'PHPC', decimals: 7 };
const SHARED = {
  id: 1,
  senderShortId: ALICE.shortId,
  receiverShortId: BOB.shortId,
  amountStroops: 20_000_000n,
  status: 'SETTLED',
  createdAt: CREATED_AT,
  token: TOKEN,
};
const BOB_ONLY = {
  ...SHARED,
  id: 2,
  senderShortId: BOB.shortId,
  receiverShortId: 'other3',
};
const SETTLEMENTS = [
  SHARED,
  BOB_ONLY,
  { ...BOB_ONLY, id: 3, status: 'PENDING' },
];
const ACCOUNTS = [ALICE, BOB];

describe('wallet history ownership (e2e)', () => {
  let app: INestApplication | undefined;
  const signer = new JwtService({
    secret: SECRET,
    signOptions: { issuer: ISSUER, expiresIn: '1h' },
  });
  const bearer = (subject: string, expiresIn = 3600) =>
    `Bearer ${signer.sign({ sub: subject }, { expiresIn })}`;

  const prisma = {
    account: {
      findUnique: jest.fn(
        async ({ where }: { where: { stellarPublicKey: string } }) =>
          ACCOUNTS.find(
            (account) => account.stellarPublicKey === where.stellarPublicKey,
          ) ?? null,
      ),
      findMany: jest.fn(async () => ACCOUNTS),
    },
    settlement: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            OR: Array<{ senderShortId?: string; receiverShortId?: string }>;
            status?: string;
          };
        }) =>
          SETTLEMENTS.filter(
            (row) =>
              (!where.status || row.status === where.status) &&
              where.OR.some(
                (filter) =>
                  filter.senderShortId === row.senderShortId ||
                  filter.receiverShortId === row.receiverShortId,
              ),
          ),
      ),
    },
    anchorTransaction: { findMany: jest.fn(async () => []) },
    onlineTransfer: { findMany: jest.fn(async () => []) },
    walletMove: { findMany: jest.fn(async () => []) },
    token: {
      findUnique: jest.fn(async () => ({
        contractId: 'fixture-contract',
        isActive: true,
      })),
    },
  };
  const historyReads = [
    prisma.settlement.findMany,
    prisma.anchorTransaction.findMany,
    prisma.onlineTransfer.findMany,
    prisma.walletMove.findMany,
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        WalletModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          SECRET_SEP10_JWT_SECRET: SECRET,
          SEP10_HOME_DOMAINS: ISSUER,
          SEP10_JWT_TIMEOUT: 3600,
        }),
      )
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(StellarService)
      .useValue({
        horizonServer: { loadAccount: async () => ({ balances: [] }) },
        getContract: async () => ({ get_vault: async () => ({ result: 0n }) }),
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  const get = (path: string) =>
    request(app!.getHttpServer()).get(`/api/v2/${path}`);

  describe.each(['wallet/history', 'transactions'])('%s', (path) => {
    it('requires a valid SEP-10 bearer before looking up the account', async () => {
      await get(path).expect(401);
      await get(path).set('Authorization', 'Bearer invalid').expect(401);
      await get(path)
        .set('Authorization', bearer(ALICE.stellarPublicKey, -60))
        .expect(401);
      expect(prisma.account.findUnique).not.toHaveBeenCalled();
      historyReads.forEach((read) => expect(read).not.toHaveBeenCalled());
    });

    it('rejects mismatched assertions and unknown subjects before reading history', async () => {
      const error = {
        error: 'Wallet history is unavailable for this account.',
      };
      const alice = bearer(ALICE.stellarPublicKey);
      await get(path)
        .set('Authorization', alice)
        .query({ shortId: BOB.shortId, publicKey: ALICE.stellarPublicKey })
        .expect(403, error);
      await get(path)
        .set('Authorization', alice)
        .query({ shortId: ALICE.shortId, publicKey: BOB.stellarPublicKey })
        .expect(403, error);
      await get(path)
        .set('Authorization', alice)
        .query({ shortId: [ALICE.shortId, BOB.shortId] })
        .expect(403, error);
      await get(path)
        .set('Authorization', bearer(UNKNOWN_WALLET))
        .expect(403, error);
      historyReads.forEach((read) => expect(read).not.toHaveBeenCalled());
    });
  });

  it('returns owner-scoped combined history with optional identifier assertions', async () => {
    const alice = await get('wallet/history')
      .set('Authorization', bearer(ALICE.stellarPublicKey))
      .query({
        shortId: ALICE.shortId,
        publicKey: ALICE.stellarPublicKey,
        limit: '20',
        since: CREATED_AT.toISOString(),
      })
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(alice.body).toEqual({
      transactions: [
        {
          id: '1',
          type: 'SEND',
          tag: 'OFFLINE',
          title: 'Sent to Bob',
          counterpartyShortId: BOB.shortId,
          amount: '-2',
          assetCode: 'PHPC',
          status: 'SETTLED',
          timestamp: CREATED_AT.toISOString(),
        },
      ],
    });
    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
    expect(prisma.anchorTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          stellarAccount: ALICE.stellarPublicKey,
          createdAt: { gte: CREATED_AT },
        },
      }),
    );
    expect(prisma.onlineTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { senderPublicKey: ALICE.stellarPublicKey },
            { recipientPublicKey: ALICE.stellarPublicKey },
          ],
          createdAt: { gte: CREATED_AT },
        },
      }),
    );
    expect(prisma.walletMove.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountPublicKey: ALICE.stellarPublicKey,
          status: 'SETTLED',
          createdAt: { gte: CREATED_AT },
        },
      }),
    );

    const bob = await get('wallet/history')
      .set('Authorization', bearer(BOB.stellarPublicKey))
      .expect(200);
    expect(bob.body.transactions).toHaveLength(3);
    expect(bob.body.transactions).toContainEqual(
      expect.objectContaining({ id: '1', type: 'RECEIVE', amount: '2' }),
    );
    expect(bob.body.transactions).toContainEqual(
      expect.objectContaining({ id: '3', status: 'PENDING' }),
    );
  });

  it('preserves the settlement-only transaction response and its filters', async () => {
    const response = await get('transactions')
      .set('Authorization', bearer(ALICE.stellarPublicKey))
      .query({
        shortId: ` ${ALICE.shortId} `,
        limit: '20',
        since: CREATED_AT.toISOString(),
      })
      .expect(200)
      .expect('Cache-Control', 'private, no-store');
    expect(response.body).toEqual({
      success: true,
      data: [
        {
          ...SHARED,
          amountStroops: '20000000',
          createdAt: CREATED_AT.toISOString(),
          senderName: 'Alice',
          receiverName: 'Bob',
        },
      ],
    });
    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { senderShortId: ALICE.shortId },
            { receiverShortId: ALICE.shortId },
          ],
          status: 'SETTLED',
          createdAt: { gte: CREATED_AT },
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
      }),
    );
    const bob = await get('transactions')
      .set('Authorization', bearer(BOB.stellarPublicKey))
      .expect(200);
    expect(bob.body.data.map((row: { id: number }) => row.id)).toEqual([1, 2]);
  });

  it('keeps both public balance reads available without a bearer', async () => {
    await get('wallet/balance')
      .query({ publicKey: ALICE.stellarPublicKey, assetCode: 'PHPC' })
      .expect(200, { balance: '0.00' });
    const vault = await get('vault-balance')
      .query({ publicKey: ALICE.stellarPublicKey })
      .expect(200);
    expect(vault.body).toMatchObject({
      balancePHP: 0,
      offlineBalancePHP: 0,
      shortId: ALICE.shortId,
    });
  });
});
