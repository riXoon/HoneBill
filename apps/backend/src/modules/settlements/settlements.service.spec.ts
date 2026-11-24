import { describe, expect, it, jest } from '@jest/globals';
import { Keypair } from '@stellar/stellar-sdk';
import { offlineFeeStroops } from 'pijin_core/offline-fee';
import { SettlementsService, buildOfflineSignatureXdr, decodeBase62 } from './settlements.util.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { InsufficientOfflineBalanceError, type StellarTransactionManager } from '../engine/stellar-transaction-manager.service.js';
import type { SettlementFinalizationService, SettlementLease } from './settlement-finalization.service.js';
import type { ConfigService } from '@nestjs/config';

function makeService() {
  const senderKey = Keypair.random();
  const gateway = Keypair.random();
  const prisma = {
    settlement: {
      findUnique: jest.fn<(...args: any[]) => Promise<any>>(),
      create: jest.fn<(...args: any[]) => Promise<any>>(),
      update: jest.fn<(...args: any[]) => Promise<any>>(),
      updateMany: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ count: 1 }),
    },
    account: { findUnique: jest.fn<(...args: any[]) => Promise<any>>() },
    token: { findUnique: jest.fn<(...args: any[]) => Promise<any>>() },
    settlementAttempt: { findUnique: jest.fn<(...args: any[]) => Promise<any>>() },
  };
  const transactionManager = {
    executeTwoPhaseSettlement: jest.fn<(...args: any[]) => Promise<any>>(),
    resumeTwoPhaseSettlement: jest.fn<(...args: any[]) => Promise<any>>(),
  };
  const config = {
    get: jest.fn((key: string) => key === 'RELAYER_PUBLIC_KEY' ? gateway.publicKey() : gateway.secret()),
    getOrThrow: jest.fn(() => 'CCGXMMXAYI4EHTGSH65ML3VK6TTRBQGT3BT2NN3P6Y3LGN6XIL2HILPX'),
  };
  const finalization = {
    claim: jest.fn(async (id: number) => ({ id, token: 'test-lease' })),
    check: jest.fn<(...args: any[]) => Promise<any>>(),
    release: jest.fn(async (_lease: SettlementLease) => undefined),
  };
  const service = new SettlementsService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    transactionManager as unknown as StellarTransactionManager,
    finalization as unknown as SettlementFinalizationService,
  );
  return { service, prisma, transactionManager, senderKey, gateway, finalization };
}

const body = (signature = Buffer.alloc(64, 7), amount = '3v5K') =>
  `1:abc123:def456:${amount}:${Buffer.alloc(32, 1).toString('base64')}:${signature.toString('base64')}`;

describe('offline PHPC fee schedule', () => {
  it.each([
    [1n, 50n], [10_000n, 50n], [10_001n, 150n], [50_000n, 150n], [50_001n, 300n],
    [100_000n, 300n], [100_001n, 750n], [500_000n, 750n], [500_001n, 1_500n], [5_000_000n, 1_500n],
  ])('charges the correct fee on %s centavos', (amount, fee) => {
    expect(offlineFeeStroops(amount * 100_000n, 'PHPC')).toBe(fee * 100_000n);
  });

  it('uses zero for unsupported fee assets', () => {
    expect(offlineFeeStroops(50_000_100_000n, 'USDC')).toBe(0n);
  });
});

describe('SettlementsService', () => {
  it.each(['insufficient balance', 'prepare timeout', 'lost lease'])(
    'distinguishes an unsubmitted insufficient-balance voucher from ambiguous failures (%s)', async (failure) => {
      const { service, prisma, transactionManager, senderKey, gateway, finalization } = makeService();
      const tokenContractId = Keypair.random().publicKey();
      const signed = buildOfflineSignatureXdr({
        amountStroops: decodeBase62('3v5K'), protocolToll: 5_000_000n, nonce: Buffer.alloc(32, 1), receiverShortId: 'def456',
        gatewayPublicKey: gateway.publicKey(), tokenContractId,
        contractId: 'CCGXMMXAYI4EHTGSH65ML3VK6TTRBQGT3BT2NN3P6Y3LGN6XIL2HILPX',
      });
      prisma.settlement.findUnique.mockResolvedValue({ id: 1, status: 'PENDING', txHash: null, signedTxXdr: null, protocolToll: 5_000_000n });
      prisma.account.findUnique.mockResolvedValueOnce({ stellarPublicKey: senderKey.publicKey(), offlineDeviceKey: senderKey.publicKey() })
        .mockResolvedValueOnce({ stellarPublicKey: Keypair.random().publicKey() });
      prisma.token.findUnique.mockResolvedValue({ id: 1, symbol: 'PHPC', contractId: tokenContractId, isActive: true });
      transactionManager.executeTwoPhaseSettlement.mockRejectedValue(failure === 'prepare timeout'
        ? new Error('RPC request timed out') : new InsufficientOfflineBalanceError());
      if (failure === 'lost lease') prisma.settlement.updateMany.mockResolvedValueOnce({ count: 0 });

      const result = service.processSettlement(body(Buffer.from(senderKey.sign(signed))));
      if (failure === 'insufficient balance') {
        await expect(result).resolves.toEqual({ txHash: null, status: 'FAILED',
          reason: 'Your Offline balance was not enough for the amount plus the offline fee.' });
      } else {
        await expect(result).rejects.toMatchObject({ status: 503 });
      }
      if (failure === 'prepare timeout') {
        expect(prisma.settlement.updateMany).not.toHaveBeenCalled();
      } else {
        expect(prisma.settlement.updateMany).toHaveBeenCalledWith({
          where: { id: 1, status: 'PENDING', recoveryLease: 'test-lease', recoveryLeaseUntil: { gt: expect.any(Date) },
            txHash: null, signedTxXdr: null, attempts: { none: {} } },
          data: { status: 'FAILED', failReason: 'Insufficient balance.' },
        });
      }
      expect(finalization.release).toHaveBeenCalledWith({ id: 1, token: 'test-lease' });
    },
  );

  it.each([5_000_000n, 30_000_000n])('settles a ₱500.01 voucher once with the signed fee %s', async (fee) => {
    const { service, prisma, transactionManager, senderKey, gateway, finalization } = makeService();
    const tokenContractId = Keypair.random().publicKey();
    const amountField = '5SNuQC';
    const amountStroops = 5_000_100_000n;
    const signed = buildOfflineSignatureXdr({
      amountStroops, protocolToll: fee, nonce: Buffer.alloc(32, 1), receiverShortId: 'def456',
      gatewayPublicKey: gateway.publicKey(), tokenContractId,
      contractId: 'CCGXMMXAYI4EHTGSH65ML3VK6TTRBQGT3BT2NN3P6Y3LGN6XIL2HILPX',
    });
    const voucher = body(Buffer.from(senderKey.sign(signed)), amountField);
    prisma.settlement.findUnique.mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ protocolToll: fee, txHash: null, signedTxXdr: null })
      .mockResolvedValueOnce({ txHash: 'confirmed', status: 'SETTLED' });
    prisma.settlement.create.mockResolvedValue({ id: 1, status: 'PENDING', protocolToll: fee });
    prisma.account.findUnique
      .mockResolvedValueOnce({ stellarPublicKey: senderKey.publicKey(), offlineDeviceKey: senderKey.publicKey() })
      .mockResolvedValueOnce({ stellarPublicKey: Keypair.random().publicKey() });
    prisma.token.findUnique.mockResolvedValue({ id: 1, symbol: 'PHPC', contractId: tokenContractId, isActive: true });
    finalization.check.mockResolvedValue({ finalized: true, evidence: { status: 'SETTLED', txHash: 'confirmed' } });

    await expect(service.processSettlement(voucher, '+639171234567')).resolves.toMatchObject({ status: 'SETTLED' });
    expect(prisma.settlement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amountStroops, protocolToll: fee }) });
    expect(transactionManager.executeTwoPhaseSettlement).toHaveBeenCalledWith(expect.objectContaining({
      args: expect.objectContaining({ amount: amountStroops, protocol_toll: fee }),
    }));
    await expect(service.processSettlement(voucher)).rejects.toMatchObject({ status: 409 });
    expect(transactionManager.executeTwoPhaseSettlement).toHaveBeenCalledTimes(1);
  });

  it('returns a duplicate conflict before looking up accounts or submitting a transaction', async () => {
    const { service, prisma, transactionManager } = makeService();
    prisma.settlement.findUnique.mockResolvedValue({ txHash: 'already-sent', status: 'SETTLED' });
    await expect(service.processSettlement(body())).rejects.toMatchObject({
      status: 409,
      responseBody: { txHash: 'already-sent', status: 'SETTLED' },
    });
    expect(prisma.account.findUnique).not.toHaveBeenCalled();
    expect(transactionManager.executeTwoPhaseSettlement).not.toHaveBeenCalled();
    expect(transactionManager.resumeTwoPhaseSettlement).not.toHaveBeenCalled();
  });

  it('rejects an invalid Ed25519 voucher before calling Soroban', async () => {
    const { service, prisma, transactionManager, senderKey } = makeService();
    prisma.settlement.findUnique.mockResolvedValue(null);
    prisma.account.findUnique
      .mockResolvedValueOnce({ shortId: 'abc123', stellarPublicKey: senderKey.publicKey(), offlineDeviceKey: senderKey.publicKey() })
      .mockResolvedValueOnce({ shortId: 'def456', stellarPublicKey: Keypair.random().publicKey(), offlineDeviceKey: null });
    prisma.token.findUnique.mockResolvedValue({ id: 1, symbol: 'PHPC', contractId: Keypair.random().publicKey(), isActive: true });
    await expect(service.processSettlement(body())).rejects.toMatchObject({ status: 401 });
    expect(transactionManager.executeTwoPhaseSettlement).not.toHaveBeenCalled();
    expect(transactionManager.resumeTwoPhaseSettlement).not.toHaveBeenCalled();
    expect(prisma.settlement.create).not.toHaveBeenCalled();
  });

  it('records a signed voucher to an unknown recipient as FAILED, so it shows in history and never settles later', async () => {
    const { service, prisma, transactionManager, senderKey, gateway } = makeService();
    const tokenContractId = Keypair.random().publicKey();
    const signed = buildOfflineSignatureXdr({
      amountStroops: decodeBase62('3v5K'),
      protocolToll: 5_000_000n,
      nonce: Buffer.alloc(32, 1),
      receiverShortId: 'def456',
      gatewayPublicKey: gateway.publicKey(),
      tokenContractId,
      contractId: 'CCGXMMXAYI4EHTGSH65ML3VK6TTRBQGT3BT2NN3P6Y3LGN6XIL2HILPX',
    });
    prisma.settlement.findUnique.mockResolvedValue(null);
    prisma.account.findUnique
      .mockResolvedValueOnce({ shortId: 'abc123', stellarPublicKey: senderKey.publicKey(), offlineDeviceKey: senderKey.publicKey() })
      .mockResolvedValueOnce(null);
    prisma.token.findUnique.mockResolvedValue({ id: 1, symbol: 'PHPC', contractId: tokenContractId, isActive: true });

    await expect(service.processSettlement(body(Buffer.from(senderKey.sign(signed))))).rejects.toMatchObject({ status: 404 });
    expect(prisma.settlement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FAILED', failReason: 'Recipient account not found', receiverShortId: 'def456' }),
    });
    expect(transactionManager.executeTwoPhaseSettlement).not.toHaveBeenCalled();
  });

  it('records nothing for an unknown recipient when the signature is not valid', async () => {
    const { service, prisma, senderKey } = makeService();
    prisma.settlement.findUnique.mockResolvedValue(null);
    prisma.account.findUnique
      .mockResolvedValueOnce({ shortId: 'abc123', stellarPublicKey: senderKey.publicKey(), offlineDeviceKey: senderKey.publicKey() })
      .mockResolvedValueOnce(null);
    prisma.token.findUnique.mockResolvedValue({ id: 1, symbol: 'PHPC', contractId: Keypair.random().publicKey(), isActive: true });
    await expect(service.processSettlement(body())).rejects.toMatchObject({ status: 401 });
    expect(prisma.settlement.create).not.toHaveBeenCalled();
  });

  it('checks a signed attempt written by another worker before retrying a legacy voucher', async () => {
    const { service, prisma, transactionManager, senderKey, gateway, finalization } = makeService();
    const tokenContractId = Keypair.random().publicKey();
    const signed = buildOfflineSignatureXdr({
      amountStroops: decodeBase62('3v5K'),
      protocolToll: 5_000_000n,
      nonce: Buffer.alloc(32, 1),
      receiverShortId: 'def456',
      gatewayPublicKey: gateway.publicKey(),
      tokenContractId,
    });
    prisma.settlement.findUnique
      .mockResolvedValueOnce({ id: 1, status: 'PENDING', txHash: null, signedTxXdr: null })
      .mockResolvedValueOnce({ txHash: 'observed-hash', signedTxXdr: 'observed-envelope', recoveryReview: null });
    prisma.account.findUnique
      .mockResolvedValueOnce({ stellarPublicKey: senderKey.publicKey(), offlineDeviceKey: senderKey.publicKey() })
      .mockResolvedValueOnce({ stellarPublicKey: Keypair.random().publicKey() });
    prisma.token.findUnique.mockResolvedValue({ id: 1, symbol: 'PHPC', contractId: tokenContractId, isActive: true });
    finalization.check.mockResolvedValue({
      finalized: false,
      evidence: { status: 'PENDING', attempts: [{ txHash: 'observed-hash', status: 'ENVELOPE_EXPIRED' }] },
    });

    await expect(service.processSettlement(body(Buffer.from(senderKey.sign(signed))))).rejects.toMatchObject({ status: 503 });
    expect(finalization.check).toHaveBeenCalledWith({ id: 1, token: 'test-lease' }, true, expect.any(Number));
    expect(transactionManager.executeTwoPhaseSettlement).not.toHaveBeenCalled();
    expect(transactionManager.resumeTwoPhaseSettlement).not.toHaveBeenCalled();
  });

  it('describes a voucher for the settlement texts', async () => {
    const { service, prisma } = makeService();
    prisma.token.findUnique.mockResolvedValue({ id: 1, symbol: 'PHPC', decimals: 7 });
    prisma.account.findUnique.mockImplementation(async (args: any) =>
      args.where.shortId === 'def456'
        ? { shortId: 'def456', phoneNumber: '+639170000002', firstName: 'Ben' }
        : { shortId: 'abc123', phoneNumber: '+639170000001', firstName: 'Ana' },
    );
    await expect(service.describeVoucher(body())).resolves.toMatchObject({
      senderShortId: 'abc123',
      receiverShortId: 'def456',
      amountStroops: decodeBase62('3v5K'),
      symbol: 'PHPC',
      receiverPhone: '+639170000002',
      senderName: 'Ana',
    });
    await expect(service.describeVoucher('not a voucher')).resolves.toBeNull();
  });

  it('uses the recorded parties and amount for a settled receipt rather than the submitted SMS fields', async () => {
    const { service, prisma } = makeService();
    const nonce = Buffer.alloc(32, 1).toString('base64');
    prisma.settlement.findUnique.mockResolvedValue({ id: 1, nonce, txHash: 'confirmed', senderShortId: 'sender',
      receiverShortId: 'recv01', amountStroops: 200_000_000n, token: { symbol: 'PHPC', decimals: 7 } });
    prisma.settlementAttempt.findUnique.mockResolvedValue({
      senderAddress: 'payer-wallet', receiverAddress: 'payee-wallet', tokenContractId: 'asset',
    });
    prisma.account.findUnique.mockResolvedValueOnce({ phoneNumber: '639170000001' })
      .mockResolvedValueOnce({ phoneNumber: '639170000002' });

    await expect(service.describeSettledVoucher(body())).resolves.toMatchObject({
      senderShortId: 'sender', receiverShortId: 'recv01', amountStroops: 200_000_000n,
      senderPhone: '639170000001', receiverPhone: '639170000002', senderAddress: 'payer-wallet',
      receiverAddress: 'payee-wallet', tokenContractId: 'asset',
    });
    expect(prisma.settlement.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { nonce, status: 'SETTLED' } }));
    expect(prisma.account.findUnique).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { stellarPublicKey: 'payer-wallet' } }));
    expect(prisma.account.findUnique).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { stellarPublicKey: 'payee-wallet' } }));
  });
});
