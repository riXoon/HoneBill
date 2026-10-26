"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const wallet_util_1 = require("../modules/wallet/wallet.util");
(0, globals_1.describe)('wallet history reconciliation', () => {
    (0, globals_1.it)('merges offline, online, and anchor transactions by newest timestamp', async () => {
        const prisma = {
            settlement: {
                findMany: globals_1.jest.fn().mockResolvedValue([
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
                findMany: globals_1.jest.fn().mockResolvedValue([
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
                findMany: globals_1.jest.fn().mockResolvedValue([
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
        const stellar = {};
        const service = new wallet_util_1.WalletService(prisma, stellar);
        const result = await service.getHistory('sender', 'Gsender');
        (0, globals_1.expect)(result.transactions).toHaveLength(3);
        (0, globals_1.expect)(result.transactions).toEqual([
            globals_1.expect.objectContaining({
                id: 'anchor-id',
                type: 'TRANSFER',
                amount: '3.5',
                assetCode: 'PHPC',
            }),
            globals_1.expect.objectContaining({
                id: 'online-hash',
                type: 'SEND',
                tag: 'WALLET',
                amount: '-1.25',
            }),
            globals_1.expect.objectContaining({
                id: '12',
                type: 'SEND',
                tag: 'OFFLINE',
                amount: '-2.5',
            }),
        ]);
        (0, globals_1.expect)(prisma.settlement.findMany).toHaveBeenCalledTimes(1);
        (0, globals_1.expect)(prisma.onlineTransfer.findMany).toHaveBeenCalledTimes(1);
        (0, globals_1.expect)(prisma.anchorTransaction.findMany).toHaveBeenCalledTimes(1);
    });
    (0, globals_1.it)('serializes large stroop amounts exactly without floating-point conversion', () => {
        (0, globals_1.expect)((0, wallet_util_1.stroopsToDecimalString)(900719925474099312345n)).toBe('90071992547409.9312345');
    });
    (0, globals_1.it)('sorts newest first and limits a reconciled history to 50 records', () => {
        const records = Array.from({ length: 60 }, (_, index) => ({
            id: String(index),
            timestamp: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
        }));
        const history = (0, wallet_util_1.buildTransactionHistory)(records);
        (0, globals_1.expect)(history).toHaveLength(50);
        (0, globals_1.expect)(history[0]).toMatchObject({ id: '59' });
        (0, globals_1.expect)(history[49]).toMatchObject({ id: '10' });
    });
});
//# sourceMappingURL=reconciliation.test.js.map