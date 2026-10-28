import { describe, expect, it, jest } from '@jest/globals';
import { WalletService } from './wallet.util.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { StellarService } from '../../infra/stellar/stellar.service.js';

const PUBLIC_KEY = `G${'A'.repeat(55)}`;

function makeService(overrides: Record<string, any> = {}) {
  const prisma = {
    settlement: { findMany: jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]) },
    onlineTransfer: {
      findMany: jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]),
      findUnique: jest.fn<(...args: any[]) => Promise<any>>(),
      update: jest.fn<(...args: any[]) => Promise<any>>(),
    },
    anchorTransaction: { findMany: jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]) },
    account: { findUnique: jest.fn<(...args: any[]) => Promise<any>>(), findMany: jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]) },
    token: { findUnique: jest.fn<(...args: any[]) => Promise<any>>() },
    ...overrides,
  };
  const stellar = {
    horizonServer: { loadAccount: jest.fn<(...args: any[]) => Promise<any>>() },
    getContract: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({
      get_vault: jest.fn<(...args: any[]) => Promise<any>>(),
    }),
    sorobanServer: { getTransaction: jest.fn<(...args: any[]) => Promise<any>>() },
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

  it('requires both history identifiers and applies the requested date and row cap', async () => {
    const { service, prisma } = makeService();
    await expect(service.getHistory('abc123', undefined, '200', '2026-01-01')).rejects.toThrow('Missing required parameter(s): publicKey');
    await service.getHistory('abc123', PUBLIC_KEY, '200', '2026-01-01T00:00:00.000Z');
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

  it('checks Soroban status before promoting an online transfer', async () => {
    const { service, prisma, stellar } = makeService();
    prisma.onlineTransfer.findUnique.mockResolvedValue({ txHash: 'a'.repeat(64), status: 'PENDING', confirmedAt: null });
    stellar.sorobanServer.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
    await expect(service.confirmTransfer('A'.repeat(64))).rejects.toMatchObject({
      legacyBody: { status: 'PENDING', error: 'Transaction has not reached the RPC history window yet' },
    });
    expect(prisma.onlineTransfer.update).not.toHaveBeenCalled();
    stellar.sorobanServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
    prisma.onlineTransfer.update.mockResolvedValue({ status: 'SETTLED', confirmedAt: new Date('2026-01-01') });
    await expect(service.confirmTransfer('A'.repeat(64))).resolves.toMatchObject({ txHash: 'a'.repeat(64), status: 'SETTLED' });
  });
});
