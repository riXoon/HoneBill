import { Injectable } from '@nestjs/common';
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
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { LockService } from '../../infra/lock/lock.service.js';

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
    const call = new Contract(this.configuredContractId()).call(
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
    relayerSecretKey: string;
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
      const persisted = await this.prisma.settlement.findUnique({
        where: { id: input.settlementId },
        select: { txHash: true, signedTxXdr: true },
      });
      if (persisted?.txHash && persisted.signedTxXdr) {
        // Another worker already prepared this voucher while we waited for the relayer lock.
        txHash = persisted.txHash;
        transaction = TransactionBuilder.fromXDR(persisted.signedTxXdr, this.stellar.networkPassphrase) as Transaction;
      } else {
        const prepared = await this.buildAndSignSpendOfflineTx(input.args, input.relayerSecretKey);
        txHash = prepared.txHash;
        transaction = prepared.transaction;
        // Persist the deterministic hash and exact signed envelope before broadcast.
        await this.prisma.settlement.update({
          where: { id: input.settlementId },
          data: { txHash, signedTxXdr: prepared.signedTxXdr, status: 'PENDING' },
        });
      }
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
    maxLockWaitMs?: number;
    maxPollAttempts?: number;
    pollIntervalMs?: number;
  }): Promise<{ txHash: string; pollResult: PollResult; sendResponse?: rpc.Api.SendTransactionResponse }> {
    // Check ledger history first so a retry never submits a transaction already confirmed.
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
      sendResponse = await this.submitSignedTransaction(input.signedTxXdr);
    } finally {
      await this.locks.release(RELAYER_LOCK_KEY, lockToken);
    }
    const pollResult = await this.pollTransactionConfirmation(input.txHash, {
      maxAttempts: input.maxPollAttempts,
      intervalMs: input.pollIntervalMs,
    });
    return { txHash: input.txHash, pollResult, sendResponse };
  }

  private configuredContractId(): string {
    return this.config.getOrThrow<string>('CONTRACT_ID');
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
