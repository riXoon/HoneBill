import { describe, expect, it, jest } from '@jest/globals';
import { SettlementReconciliationService, buildNonceLedgerKey } from './reconciliation.util.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { StellarService } from '../../infra/stellar/stellar.service.js';

const CONTRACT_ID = 'CBYRV2FDGXHMKQILP3EWYI4ILKKQ2HW4NW4NJCFYQY6NEE7463ARLNUD';

function makeService() {
  const prisma = { settlement: { update: jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({}) } };
  const stellar = { sorobanServer: {
    getTransaction: jest.fn<(...args: any[]) => Promise<any>>(),
    getLedgerEntries: jest.fn<(...args: any[]) => Promise<any>>(),
  } };
  return {
    service: new SettlementReconciliationService(prisma as unknown as PrismaService, stellar as unknown as StellarService),
    prisma,
    stellar,
  };
}

describe('settlement reconciliation', () => {
  it('builds a persistent nonce storage key and rejects wrong nonce sizes', () => {
    expect(buildNonceLedgerKey(Buffer.alloc(32, 1), CONTRACT_ID).toXDR('base64')).not.toBe('');
    expect(() => buildNonceLedgerKey(Buffer.from([1, 2, 3]), CONTRACT_ID)).toThrow('Nonce must be exactly 32 bytes');
  });

  it('marks an RPC-confirmed transaction settled', async () => {
    const { service, prisma, stellar } = makeService();
    stellar.sorobanServer.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
    const result = await service.reconcile({ id: 7, nonce: Buffer.alloc(32, 1).toString('base64'), txHash: 'a'.repeat(64) }, CONTRACT_ID);
    expect(result).toEqual({ status: 'SETTLED', source: 'RPC_TX_SUCCESS', txHash: 'a'.repeat(64) });
    expect(prisma.settlement.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status: 'SETTLED', failReason: null } });
    expect(stellar.sorobanServer.getLedgerEntries).not.toHaveBeenCalled();
  });

  it('uses contract nonce storage when RPC history is missing', async () => {
    const { service, prisma, stellar } = makeService();
    stellar.sorobanServer.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
    stellar.sorobanServer.getLedgerEntries.mockResolvedValue({ entries: [{ key: {}, val: {} }], latestLedger: 1 });
    const result = await service.reconcile({ id: 8, nonce: Buffer.alloc(32, 2).toString('base64'), txHash: 'b'.repeat(64) }, CONTRACT_ID);
    expect(result).toMatchObject({ status: 'SETTLED', source: 'CONTRACT_STORAGE_NONCE' });
    expect(prisma.settlement.update).toHaveBeenCalledTimes(1);
  });

  it('allows retry when RPC and contract storage show no committed transaction', async () => {
    const { service, prisma, stellar } = makeService();
    stellar.sorobanServer.getTransaction.mockResolvedValue({ status: 'NOT_FOUND' });
    stellar.sorobanServer.getLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 1 });
    await expect(service.reconcile({ id: 9, nonce: Buffer.alloc(32, 3).toString('base64') }, CONTRACT_ID)).resolves.toMatchObject({ status: 'SAFE_TO_RETRY' });
    expect(prisma.settlement.update).not.toHaveBeenCalled();
  });
});
