import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  Address,
  Contract,
  Keypair,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { stellarNetworkId } from '../../infra/stellar/network-id.js';
import { LockService } from '../../infra/lock/lock.service.js';
import { userFailureReason } from './settlement-notice.util.js';

export interface SpendOfflineArgs {
  gateway: string;
  sender: string;
  token: string;
  receiver_short_id: Buffer;
  amount: bigint;
  protocol_toll: bigint;
  nonce: Buffer;
  signature: Buffer;
}

export interface PollResult {
  status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND';
  txHash: string;
  returnValue?: unknown;
  errorResultXdr?: string;
  rawResponse?: rpc.Api.GetTransactionResponse;
}

export interface PreparedRelayerTransaction {
  txHash: string;
  signedTxXdr: string;
  signerAddress: string;
  contractId: string;
  transaction: Transaction;
}

const RELAYER_LOCK_KEY = 'honebill:relayer:lock';

@Injectable()
export class StellarTransactionManager {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly locks: LockService,
    private readonly config: ConfigService,
  ) {}

  async buildAndSignSpendOfflineTx(
    args: SpendOfflineArgs,
    relayerSecretKey: string,
  ): Promise<PreparedRelayerTransaction> {
    const relayer = Keypair.fromSecret(relayerSecretKey);
    const account = await this.stellar.sorobanServer.getAccount(relayer.publicKey());
    const contractId = this.configuredContractId();
    const call = new Contract(contractId).call(
      'spend_offline',
      Address.fromString(relayer.publicKey()).toScVal(),
      Address.fromString(args.sender).toScVal(),
      Address.fromString(args.token).toScVal(),
      xdr.ScVal.scvBytes(Buffer.from(args.receiver_short_id)),
      nativeToScVal(args.amount, { type: 'i128' }),
      nativeToScVal(args.protocol_toll, { type: 'i128' }),
      xdr.ScVal.scvBytes(Buffer.from(args.nonce)),
      xdr.ScVal.scvBytes(Buffer.from(args.signature)),
    );
    const base = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.stellar.networkPassphrase,
    }).addOperation(call).setTimeout(300).build();

    let prepared: Transaction;
    try {
      prepared = await this.stellar.sorobanServer.prepareTransaction(base) as Transaction;
    } catch (error) {
      throw new Error(`Soroban simulation failed during transaction preparation: ${errorMessage(error)}`);
    }
    prepared.sign(relayer);
    return {
      txHash: prepared.hash().toString('hex'),
      signedTxXdr: prepared.toXDR(),
      signerAddress: relayer.publicKey(),
      contractId,
      transaction: prepared,
    };
  }

  async submitSignedTransaction(transaction: Transaction | string): Promise<rpc.Api.SendTransactionResponse> {
    const tx = typeof transaction === 'string'
      ? TransactionBuilder.fromXDR(transaction, this.stellar.networkPassphrase) as Transaction
      : transaction;
    const response = await this.stellar.sorobanServer.sendTransaction(tx);
    if (response.status === 'ERROR') {
      const details = response.errorResult
        ? (typeof response.errorResult === 'string' ? response.errorResult : response.errorResult.toXDR('base64'))
        : 'no error XDR provided';
      throw new Error(`Soroban sendTransaction failed: status=ERROR errorResult=${details}`);
    }
    return response;
  }

  async pollTransactionConfirmation(
    txHash: string,
    options: { maxAttempts?: number; intervalMs?: number } = {},
  ): Promise<PollResult> {
    const maxAttempts = options.maxAttempts ?? 15;
    const intervalMs = options.intervalMs ?? 1000;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const result = await this.stellar.sorobanServer.getTransaction(txHash);
      if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return { status: 'SUCCESS', txHash, returnValue: result.returnValue, rawResponse: result };
      }
      if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
        return { status: 'FAILED', txHash, errorResultXdr: result.resultXdr?.toXDR('base64'), rawResponse: result };
      }
      if (attempt < maxAttempts) await wait(intervalMs);
    }
    return { status: 'NOT_FOUND', txHash };
  }

  async executeTwoPhaseSettlement(input: {
    settlementId: number;
    args: SpendOfflineArgs;
    receiverAddress: string;
    relayerSecretKey: string;
    leaseToken?: string;
    maxLockWaitMs?: number;
    maxPollAttempts?: number;
    pollIntervalMs?: number;
  }): Promise<{ txHash: string; pollResult: PollResult; sendResponse: rpc.Api.SendTransactionResponse }> {
    const lockToken = randomUUID();
    const maxWait = input.maxLockWaitMs ?? 20_000;
    const deadline = Date.now() + maxWait;
    let acquired = false;
    while (!acquired && Date.now() <= deadline) {
      acquired = await this.locks.acquire(RELAYER_LOCK_KEY, lockToken, 30_000);
      if (!acquired) await wait(200);
    }
    if (!acquired) throw new Error(`Timeout waiting for relayer lock after ${maxWait}ms (settlementId=${input.settlementId})`);

    let txHash: string;
    let transaction: Transaction;
    let sendResponse: rpc.Api.SendTransactionResponse;
    try {
      const persisted = await this.pendingSettlement(input.settlementId, input.leaseToken);
      if (persisted.txHash && persisted.signedTxXdr) {
        // Another worker already prepared this voucher while we waited for the relayer lock.
        txHash = persisted.txHash;
        transaction = await this.recordExistingEnvelope(persisted, txHash, persisted.signedTxXdr);
      } else {
        if (persisted.txHash !== null || persisted.signedTxXdr !== null) throw attemptUnavailable();
        if (persisted.amountStroops !== input.args.amount ||
            (persisted.protocolToll != null && persisted.protocolToll !== input.args.protocol_toll) ||
            persisted.receiverShortId !== input.args.receiver_short_id.toString('ascii') ||
            !Buffer.from(persisted.nonce, 'base64').equals(input.args.nonce)) {
          throw attemptUnavailable();
        }
        const prepared = await this.buildAndSignSpendOfflineTx(input.args, input.relayerSecretKey);
        txHash = prepared.txHash;
        transaction = prepared.transaction;
        // Keep the current-envelope fields for older workers. The nested write commits both records together.
        try {
          await this.prisma.settlement.update({
            where: { id: persisted.id, status: 'PENDING', txHash: null, signedTxXdr: null,
              ...(input.leaseToken ? { recoveryLease: input.leaseToken, recoveryLeaseUntil: { gt: new Date() } } : {}),
            },
            data: {
              txHash,
              signedTxXdr: prepared.signedTxXdr,
              recoveryReview: null,
              attempts: { create: {
                txHash,
                signedTxXdr: prepared.signedTxXdr,
                nonce: persisted.nonce,
                receiverShortId: persisted.receiverShortId,
                amountStroops: persisted.amountStroops,
                senderAddress: input.args.sender,
                receiverAddress: input.receiverAddress,
                gatewayAddress: input.args.gateway,
                tokenContractId: input.args.token,
                contractId: prepared.contractId,
                networkId: this.networkId(),
                protocolToll: input.args.protocol_toll,
                ...envelopeBounds(transaction),
              } },
            },
          });
        } catch {
          // A failed write or a competing worker must leave this envelope unbroadcast.
          throw attemptUnavailable();
        }
      }
      if (input.leaseToken) await this.pendingSettlement(input.settlementId, input.leaseToken);
      sendResponse = await this.submitSignedTransaction(transaction);
    } finally {
      await this.locks.release(RELAYER_LOCK_KEY, lockToken);
    }
    const pollResult = await this.pollTransactionConfirmation(txHash, {
      maxAttempts: input.maxPollAttempts,
      intervalMs: input.pollIntervalMs,
    });
    return { txHash, pollResult, sendResponse };
  }

  async resumeTwoPhaseSettlement(input: {
    settlementId: number;
    txHash: string;
    signedTxXdr: string;
    leaseToken?: string;
    maxLockWaitMs?: number;
    maxPollAttempts?: number;
    pollIntervalMs?: number;
  }): Promise<{ txHash: string; pollResult: PollResult; sendResponse?: rpc.Api.SendTransactionResponse }> {
    const persisted = await this.pendingSettlement(input.settlementId, input.leaseToken);
    const transaction = await this.recordExistingEnvelope(persisted, input.txHash, input.signedTxXdr);
    // Check ledger history before resubmitting an existing envelope.
    const priorResult = await this.pollTransactionConfirmation(input.txHash, {
      maxAttempts: 1,
      intervalMs: 0,
    });
    if (priorResult.status !== 'NOT_FOUND') {
      return { txHash: input.txHash, pollResult: priorResult };
    }

    const lockToken = randomUUID();
    const maxWait = input.maxLockWaitMs ?? 20_000;
    const deadline = Date.now() + maxWait;
    let acquired = false;
    while (!acquired && Date.now() <= deadline) {
      acquired = await this.locks.acquire(RELAYER_LOCK_KEY, lockToken, 30_000);
      if (!acquired) await wait(200);
    }
    if (!acquired) throw new Error(`Timeout waiting for relayer lock after ${maxWait}ms (settlementId=${input.settlementId})`);

    let sendResponse: rpc.Api.SendTransactionResponse;
    try {
      const current = await this.pendingSettlement(input.settlementId, input.leaseToken);
      if (current.txHash !== input.txHash || current.signedTxXdr !== input.signedTxXdr) throw attemptUnavailable();
      sendResponse = await this.submitSignedTransaction(transaction);
    } finally {
      await this.locks.release(RELAYER_LOCK_KEY, lockToken);
    }
    const pollResult = await this.pollTransactionConfirmation(input.txHash, {
      maxAttempts: input.maxPollAttempts,
      intervalMs: input.pollIntervalMs,
    });
    return { txHash: input.txHash, pollResult, sendResponse };
  }

  private async pendingSettlement(id: number, leaseToken?: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
      select: {
        id: true, status: true, failReason: true, txHash: true, signedTxXdr: true,
        nonce: true, receiverShortId: true, amountStroops: true, protocolToll: true, relayerAddress: true,
        recoveryLease: true, recoveryLeaseUntil: true,
      },
    }).catch(() => { throw attemptUnavailable(); });
    if (!settlement) throw attemptUnavailable();
    if (settlement.status !== 'PENDING') {
      throw new ApiResponseException(409, {
        txHash: settlement.txHash,
        status: settlement.status,
        ...(settlement.status === 'FAILED' ? { reason: userFailureReason(settlement.failReason) } : {}),
      });
    }
    if (leaseToken && (settlement.recoveryLease !== leaseToken || !settlement.recoveryLeaseUntil ||
      settlement.recoveryLeaseUntil.getTime() <= Date.now())) throw attemptUnavailable();
    return settlement;
  }

  private async recordExistingEnvelope(
    settlement: Awaited<ReturnType<StellarTransactionManager['pendingSettlement']>>,
    txHash: string,
    signedTxXdr: string,
  ): Promise<Transaction> {
    if (settlement.txHash !== txHash || settlement.signedTxXdr !== signedTxXdr) throw attemptUnavailable();
    try {
      const tx = TransactionBuilder.fromXDR(signedTxXdr, this.stellar.networkPassphrase);
      if (!(tx instanceof Transaction) || tx.hash().toString('hex') !== txHash) throw attemptUnavailable();

      const key = { settlementId: settlement.id, txHash };
      const attempt = await this.prisma.settlementAttempt.findUnique({
        where: { settlementId_txHash: key }, select: { networkId: true, signedTxXdr: true },
      });
      const networkId = this.networkId();
      if (attempt && (attempt.signedTxXdr !== signedTxXdr || (attempt.networkId && attempt.networkId !== networkId))) {
        throw attemptUnavailable();
      }
      // During a rolling deploy an older worker may have populated the projection after the migration ran.
      if (!attempt || !attempt.networkId) {
        const metadata = { networkId, ...envelopeBounds(tx) };
        await this.prisma.settlement.update({
          where: { id: settlement.id, status: 'PENDING', txHash, signedTxXdr,
            ...(settlement.recoveryLease ? { recoveryLease: settlement.recoveryLease, recoveryLeaseUntil: { gt: new Date() } } : {}),
          },
          data: {
            recoveryReview: 'LEGACY_INTENT_UNVERIFIED',
            attempts: { upsert: {
              where: { settlementId_txHash: key },
              create: {
                txHash, signedTxXdr, ...metadata,
                nonce: settlement.nonce,
                receiverShortId: settlement.receiverShortId,
                amountStroops: settlement.amountStroops,
                gatewayAddress: settlement.relayerAddress,
              },
              update: metadata,
            } },
          },
        });
      }
      return tx;
    } catch {
      throw attemptUnavailable();
    }
  }

  private networkId(): string {
    return stellarNetworkId(this.stellar.networkPassphrase);
  }

  private configuredContractId(): string {
    return this.config.getOrThrow<string>('CONTRACT_ID');
  }
}

function envelopeBounds(transaction: Transaction) {
  const { timeBounds, ledgerBounds } = transaction;
  return {
    sourceSequence: BigInt(transaction.sequence),
    minTime: timeBounds ? BigInt(timeBounds.minTime) : null,
    maxTime: timeBounds ? BigInt(timeBounds.maxTime) : null,
    minLedger: ledgerBounds ? BigInt(ledgerBounds.minLedger) : null,
    maxLedger: ledgerBounds ? BigInt(ledgerBounds.maxLedger) : null,
  };
}

function attemptUnavailable() {
  return new ServiceUnavailableException('Settlement service unavailable while recording the signed attempt.');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
