import { describe, expect, it, jest } from '@jest/globals';
import { WalletService } from './wallet.util.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { StellarService } from '../../infra/stellar/stellar.service.js';

const PUBLIC_KEY = `G${'A'.repeat(55)}`;
const OWNER = { shortId: 'abc123', stellarPublicKey: PUBLIC_KEY };

function makeService(overrides: Record<string, any> = {}) {
  const prisma = {
    settlement: { findMany: jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]) },
    onlineTransfer: {
      findMany: jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]),
    },
    walletMove: {
      findMany: jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]),
    },
    anchorTransaction: { findMany: jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]) },
    account: { findUnique: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(OWNER), findMany: jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]) },
    token: { findUnique: jest.fn<(...args: any[]) => Promise<any>>() },
    ...overrides,
  };
  const stellar = {
    horizonServer: { loadAccount: jest.fn<(...args: any[]) => Promise<any>>() },
    getContract: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      get_vault: jest.fn<(...args: any[]) => Promise<any>>(),
    }),
  };
  return { service: new WalletService(prisma as unknown as PrismaService, stellar as unknown as StellarService), prisma, stellar };
}

describe('WalletService', () => {
  it('validates public key and asset before making a Horizon request', async () => {
    const { service, stellar } = makeService();
    await expect(service.getBalance('', 'PHPC')).rejects.toThrow('Missing required query parameter: publicKey');
    await expect(service.getBalance('bad', 'PHPC')).rejects.toThrow('Invalid Stellar public key format.');
    await expect(service.getBalance(PUBLIC_KEY, 'XLM')).rejects.toThrow('Unsupported asset code');
    expect(stellar.horizonServer.loadAccount).not.toHaveBeenCalled();
  });

  it('returns zero for an unfunded account and a trustline balance when present', async () => {
    const { service, stellar } = makeService();
    stellar.horizonServer.loadAccount.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(service.getBalance(PUBLIC_KEY, 'phpc')).resolves.toEqual({ balance: '0.00' });
    stellar.horizonServer.loadAccount.mockResolvedValueOnce({ balances: [
      { asset_type: 'credit_alphanum4', asset_code: 'PHPC', asset_issuer: 'GDDKZAOAME26SD2GAQGGDUTI6F5VQ5CLXXELWOYOAXLUIQTQVLIFWZLY', balance: '9.2500000' },
    ] });
    await expect(service.getBalance(PUBLIC_KEY, 'PHPC')).resolves.toEqual({ balance: '9.2500000' });
  });

  it('uses the subject to resolve history identifiers and applies the requested date and row cap', async () => {
    const { service, prisma } = makeService();
    await service.getHistory(PUBLIC_KEY, { limit: '200', since: '2026-01-01T00:00:00.000Z' });
    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { stellarPublicKey: PUBLIC_KEY },
      select: { shortId: true, stellarPublicKey: true },
    });
    expect(prisma.settlement.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, where: expect.objectContaining({ createdAt: { gte: new Date('2026-01-01T00:00:00.000Z') } }) }));
    expect(prisma.anchorTransaction.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ stellarAccount: PUBLIC_KEY }) }));
  });

  it('reads online and vault balances without converting raw values through Number', async () => {
    const { service, prisma, stellar } = makeService();
    prisma.account.findUnique.mockResolvedValue({ shortId: 'abc123', stellarPublicKey: PUBLIC_KEY });
    prisma.token.findUnique.mockResolvedValue({ contractId: 'CDUMMY', isActive: true });
    stellar.horizonServer.loadAccount.mockResolvedValue({ balances: [
      { asset_type: 'credit_alphanum4', asset_code: 'PHPC', asset_issuer: 'GDDKZAOAME26SD2GAQGGDUTI6F5VQ5CLXXELWOYOAXLUIQTQVLIFWZLY', balance: '1.0000001' },
    ] });
    const mockContract = await stellar.getContract();
    mockContract.get_vault.mockResolvedValue({ result: 900719925474099312345n });
    await expect(service.getVaultBalance('abc123')).resolves.toMatchObject({
      balanceStroops: '10000001', offlineBalanceStroops: '900719925474099312345', shortId: 'abc123',
    });
  });

  it('lists a confirmed move as one entry per wallet, the credit side marked as a mirror', async () => {
    const { service, prisma } = makeService();
    prisma.walletMove.findMany.mockResolvedValue([
      {
        id: 'm1',
        txHash: 'b'.repeat(64),
        direction: 'TO_OFFLINE',
        amountStroops: 125_000_000n,
        status: 'SETTLED',
        createdAt: new Date('2026-11-10T01:00:00.000Z'),
        confirmedAt: new Date('2026-11-10T01:00:06.000Z'),
        token: { symbol: 'PHPC', decimals: 7 },
      },
    ]);
    const { transactions } = await service.getHistory(PUBLIC_KEY);
    expect(prisma.walletMove.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ accountPublicKey: PUBLIC_KEY, status: { in: ['SETTLED', 'FAILED'] } }) }),
    );
    expect(transactions).toHaveLength(2);
    expect(transactions.find((t) => t.id === 'move:m1:out')).toMatchObject({
      tag: 'WALLET', title: 'Transferred to Offline Balance', amount: '-12.5', txHash: 'b'.repeat(64),
    });
    expect(transactions.find((t) => t.id === 'move:m1:in')).toMatchObject({
      tag: 'OFFLINE', title: 'Received from Online Balance', amount: '12.5', mirror: true,
    });
  });

  it('names the other party short ID on offline payments', async () => {
    const { service, prisma } = makeService();
    prisma.settlement.findMany.mockResolvedValue([
      { id: 's1', senderShortId: 'abc123', receiverShortId: 'zzz999', amountStroops: 10_000_000n, status: 'SETTLED', createdAt: new Date('2026-11-10T03:00:00.000Z'), token: { symbol: 'PHPC', decimals: 7 } },
      { id: 's2', senderShortId: 'qqq111', receiverShortId: 'abc123', amountStroops: 20_000_000n, status: 'SETTLED', createdAt: new Date('2026-11-10T04:00:00.000Z'), token: { symbol: 'PHPC', decimals: 7 } },
    ]);
    const { transactions } = await service.getHistory(PUBLIC_KEY);
    expect(transactions.find((t) => t.id === 's1')).toMatchObject({ type: 'SEND', counterpartyShortId: 'zzz999' });
    expect(transactions.find((t) => t.id === 's2')).toMatchObject({ type: 'RECEIVE', counterpartyShortId: 'qqq111' });
  });

  it('swaps the wallets for a move from offline to online', async () => {
    const { service, prisma } = makeService();
    prisma.walletMove.findMany.mockResolvedValue([
      {
        id: 'm2', txHash: 'c'.repeat(64), direction: 'TO_ONLINE', amountStroops: 50_000_000n, status: 'SETTLED',
        createdAt: new Date('2026-11-10T02:00:00.000Z'), confirmedAt: null, token: { symbol: 'PHPC', decimals: 7 },
      },
    ]);
    const { transactions } = await service.getHistory(PUBLIC_KEY);
    expect(transactions.find((t) => t.id === 'move:m2:out')).toMatchObject({ tag: 'OFFLINE', title: 'Transferred to Online Balance' });
    expect(transactions.find((t) => t.id === 'move:m2:in')).toMatchObject({ tag: 'WALLET', title: 'Received from Offline Balance', mirror: true });
  });
});
