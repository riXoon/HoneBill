import { Injectable } from '@nestjs/common';
import { Address, rpc, xdr } from '@stellar/stellar-sdk';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { restorePadding } from './settlements.util.js';

export interface SettlementCandidate {
  id: number;
  nonce: string;
  txHash?: string | null;
}

export type ReconciliationResult =
  | { status: 'SETTLED'; source: 'RPC_TX_SUCCESS' | 'CONTRACT_STORAGE_NONCE'; txHash?: string | null }
  | { status: 'SAFE_TO_RETRY'; reason: string; txHash?: string | null };

export function buildNonceLedgerKey(nonce: Buffer | string, contractId: string): xdr.LedgerKey {
  const bytes = typeof nonce === 'string' ? Buffer.from(restorePadding(nonce), 'base64') : nonce;
  if (bytes.length !== 32) throw new Error(`Nonce must be exactly 32 bytes, got ${bytes.length}`);
  return xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
    contract: Address.fromString(contractId).toScAddress(),
    key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Nonce'), xdr.ScVal.scvBytes(bytes)]),
    durability: xdr.ContractDataDurability.persistent(),
  }));
}

@Injectable()
export class SettlementReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
  ) {}

  async isNonceCommittedOnChain(nonce: Buffer | string, contractId: string): Promise<boolean> {
    try {
      const response = await this.stellar.sorobanServer.getLedgerEntries(buildNonceLedgerKey(nonce, contractId));
      return Boolean(response.entries?.length);
    } catch {
      return false;
    }
  }

  async reconcile(candidate: SettlementCandidate, contractId: string): Promise<ReconciliationResult> {
    if (candidate.txHash) {
      try {
        const transaction = await this.stellar.sorobanServer.getTransaction(candidate.txHash);
        if (transaction.status === rpc.Api.GetTransactionStatus.SUCCESS) {
          await this.prisma.settlement.update({ where: { id: candidate.id }, data: { status: 'SETTLED', failReason: null } });
          return { status: 'SETTLED', source: 'RPC_TX_SUCCESS', txHash: candidate.txHash };
        }
      } catch {
        // Continue to the contract nonce check after RPC errors or pruned history.
      }
    }
    if (await this.isNonceCommittedOnChain(candidate.nonce, contractId)) {
      await this.prisma.settlement.update({ where: { id: candidate.id }, data: { status: 'SETTLED', failReason: null } });
      return { status: 'SETTLED', source: 'CONTRACT_STORAGE_NONCE', txHash: candidate.txHash };
    }
    return {
      status: 'SAFE_TO_RETRY',
      reason: 'Nonce is not committed on-chain; transaction was not included in ledger.',
      txHash: candidate.txHash,
    };
  }
}
