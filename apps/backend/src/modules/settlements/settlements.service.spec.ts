import { describe, expect, it, jest } from '@jest/globals';
import { Keypair } from '@stellar/stellar-sdk';
import { SettlementsService } from './settlements.util.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { ConfigService } from '@nestjs/config';

function makeService() {
  const senderKey = Keypair.random();
  const gateway = Keypair.random();
  const prisma = {
    settlement: {
      findUnique: jest.fn<(...args: any[]) => Promise<any>>(),
      create: jest.fn<(...args: any[]) => Promise<any>>(),
      update: jest.fn<(...args: any[]) => Promise<any>>(),
    },
    account: { findUnique: jest.fn<(...args: any[]) => Promise<any>>() },
    token: { findUnique: jest.fn<(...args: any[]) => Promise<any>>() },
  };
  const config = {
    get: jest.fn((key: string) => key === 'RELAYER_PUBLIC_KEY' ? gateway.publicKey() : gateway.secret()),
    getOrThrow: jest.fn(() => 'CCGXMMXAYI4EHTGSH65ML3VK6TTRBQGT3BT2NN3P6Y3LGN6XIL2HILPX'),
  };
  const transactionManager = {};
  const service = new SettlementsService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    transactionManager as any,
  );
  return { service, prisma, senderKey, gateway };
}

const body = (signature = Buffer.alloc(64, 7)) =>
  `1:abc123:def456:3v5K:${Buffer.alloc(32, 1).toString('base64')}:${signature.toString('base64')}`;

describe('SettlementsService', () => {
  it('returns a duplicate conflict before looking up accounts or submitting a transaction', async () => {
    const { service, prisma } = makeService();
    prisma.settlement.findUnique.mockResolvedValue({ txHash: 'already-sent', status: 'SETTLED' });
    await expect(service.processSettlement(body())).rejects.toMatchObject({
      status: 409,
      legacyBody: { txHash: 'already-sent', status: 'SETTLED' },
    });
    expect(prisma.account.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an invalid Ed25519 voucher before calling Soroban', async () => {
    const { service, prisma, senderKey } = makeService();
    prisma.settlement.findUnique.mockResolvedValue(null);
    prisma.account.findUnique
      .mockResolvedValueOnce({ shortId: 'abc123', stellarPublicKey: senderKey.publicKey(), offlineDeviceKey: senderKey.publicKey() })
      .mockResolvedValueOnce({ shortId: 'def456', stellarPublicKey: Keypair.random().publicKey(), offlineDeviceKey: null });
    prisma.token.findUnique.mockResolvedValue({ id: 1, symbol: 'PHPC', contractId: Keypair.random().publicKey(), isActive: true });
    await expect(service.processSettlement(body())).rejects.toMatchObject({ status: 401 });
    expect(prisma.settlement.create).not.toHaveBeenCalled();
    expect(prisma.settlement.create).not.toHaveBeenCalled();
  });
});
