import { describe, expect, it, jest } from '@jest/globals';
import type { PrismaService } from '../infra/prisma/prisma.service';
import type { StellarService } from '../infra/stellar/stellar.service';
import { buildTransactionHistory, stroopsToDecimalString, WalletService } from '../modules/wallet/wallet.util';

describe('wallet history reconciliation', () => {
  it('merges offline, online, and anchor transactions by newest timestamp', async () => {
    const prisma = {
      settlement: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          {
            id: 12,
            senderShortId: 'sender',
            receiverShortId: 'receiver',
            amountStroops: 25000000n,
            status: 'SETTLED',
            createdAt: new Date('2025-01-01T10:00:00.000Z'),
            token: { symbol: 'PHPC' },
          },
        ]),
      },
      onlineTransfer: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          {
            txHash: 'online-hash',
            senderPublicKey: 'Gsender',
            recipientPublicKey: 'Greceiver',
            amountStroops: 12500000n,
            status: 'SETTLED',
            createdAt: new Date('2025-01-01T11:00:00.000Z'),
            token: { symbol: 'PHPC' },
          },
        ]),
      },
      anchorTransaction: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          {
            id: 'anchor-id',
            type: 'deposit',
            amountOut: '3.5',
            assetCode: 'PHPC',
            status: 'completed',
            createdAt: new Date('2025-01-01T12:00:00.000Z'),
          },
        ]),
      },
    };
    const stellar = {} as StellarService;
    const service = new WalletService(prisma as unknown as PrismaService, stellar);

    const result = await service.getHistory('sender', 'Gsender');

    expect(result.transactions).toHaveLength(3);
    expect(result.transactions).toEqual([
      expect.objectContaining({
        id: 'anchor-id',
        type: 'TRANSFER',
        amount: '3.5',
        assetCode: 'PHPC',
      }),
      expect.objectContaining({
        id: 'online-hash',
        type: 'SEND',
        tag: 'WALLET',
        amount: '-1.25',
      }),
      expect.objectContaining({
        id: '12',
        type: 'SEND',
        tag: 'OFFLINE',
        amount: '-2.5',
      }),
    ]);
    expect(prisma.settlement.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.onlineTransfer.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.anchorTransaction.findMany).toHaveBeenCalledTimes(1);
  });

  it('serializes large stroop amounts exactly without floating-point conversion', () => {
    expect(stroopsToDecimalString(900719925474099312345n)).toBe('90071992547409.9312345');
  });

  it('sorts newest first and limits a reconciled history to 50 records', () => {
    const records = Array.from({ length: 60 }, (_, index) => ({
      id: String(index),
      timestamp: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
    }));

    const history = buildTransactionHistory(records);

    expect(history).toHaveLength(50);
    expect(history[0]).toMatchObject({ id: '59' });
    expect(history[49]).toMatchObject({ id: '10' });
  });
});
