import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Account,
  Address,
  Contract,
  Keypair,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { randomUUID } from 'node:crypto';
import { LockService } from '../lock/lock.service';
import { PrismaService } from '../prisma/prisma.service';
import { StellarService } from './stellar.service';

export interface SpendOfflineContractArgs {
  gateway: string;
  sender: string;
  token: string;
  receiver_short_id: Buffer;
  amount: bigint;
  protocol_toll: bigint;
  nonce: Buffer;
  signature: Buffer;
}

export interface PreparedRelayerTransaction {
  txHash: string;
  signedTxXdr: string;
  signerAddress: string;
  transaction: Transaction;
}

export interface TransactionPollResult {
  status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND';
  txHash: string;
  returnValue?: unknown;
  errorResultXdr?: string;
  rawResponse?: rpc.Api.GetTransactionResponse;
}

@Injectable()
export class StellarTransactionManager {
  private readonly logger = new Logger(StellarTransactionManager.name);
  private readonly lockKey = 'honebill:relayer:lock';

  constructor(
    private readonly stellar: StellarService,
    private readonly prisma: PrismaService,
    private readonly locks: LockService,
    private readonly config: ConfigService,
  ) {}

  async buildAndSignSpendOfflineTx(
    args: SpendOfflineContractArgs,
    relayerSecretKey: string,
    networkPassphrase = this.stellar.networkPassphrase,
  ): Promise<PreparedRelayerTransaction> {
    const relayer = Keypair.fromSecret(relayerSecretKey);
    const contractId = this.config.get<string>('CONTRACT_ID');
    if (!contractId) throw new Error('Missing CONTRACT_ID for Soroban spend_offline invocation.');

    let account: Account;
    try {
      account = await this.stellar.sorobanServer.getAccount(relayer.publicKey());
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') throw error;
      account = new Account(relayer.publicKey(), '0');
    }

    const operation = new Contract(contractId).call(
      'spend_offline',
      Address.fromString(relayer.publicKey()).toScVal(),
      Address.fromString(args.sender).toScVal(),
      Address.fromString(args.token).toScVal(),
      xdr.ScVal.scvBytes(args.receiver_short_id),
      nativeToScVal(args.amount, { type: 'i128' }),
      nativeToScVal(args.protocol_toll, { type: 'i128' }),
      xdr.ScVal.scvBytes(args.nonce),
      xdr.ScVal.scvBytes(args.signature),
    );
    const base = new TransactionBuilder(account, { fee: '100', networkPassphrase })
      .addOperation(operation)
      .setTimeout(300)
      .build();

    let prepared: Transaction;
    try {
      prepared = (await this.stellar.sorobanServer.prepareTransaction(base)) as Transaction;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Soroban simulation failed during transaction preparation: ${message}`);
    }
    prepared.sign(relayer);
    return {
      txHash: prepared.hash().toString('hex'),
      signedTxXdr: prepared.toXDR(),
      signerAddress: relayer.publicKey(),
      transaction: prepared,
    };
  }

  async submitSignedTransaction(
    transaction: Transaction | string,
    networkPassphrase = this.stellar.networkPassphrase,
  ): Promise<rpc.Api.SendTransactionResponse> {
    const tx = typeof transaction === 'string'
      ? (TransactionBuilder.fromXDR(transaction, networkPassphrase) as Transaction)
      : transaction;
    const response = await this.stellar.sorobanServer.sendTransaction(tx);
    if (response.status === 'ERROR') {
      const errorResult = response.errorResult
        ? typeof response.errorResult === 'string'
          ? response.errorResult
          : response.errorResult.toXDR('base64')
        : (response as { errorResultXdr?: string }).errorResultXdr ?? 'no error XDR provided';
      throw new Error(`Soroban sendTransaction failed: status=ERROR errorResult=${errorResult}`);
    }
    return response;
  }

  async pollTransactionConfirmation(
    txHash: string,
    options: { maxAttempts?: number; intervalMs?: number } = {},
  ): Promise<TransactionPollResult> {
    const maxAttempts = options.maxAttempts ?? 15;
    const intervalMs = options.intervalMs ?? 1000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await this.stellar.sorobanServer.getTransaction(txHash);
      if (response.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return { status: 'SUCCESS', txHash, returnValue: response.returnValue, rawResponse: response };
      }
      if (response.status === rpc.Api.GetTransactionStatus.FAILED) {
        return {
          status: 'FAILED', txHash,
          errorResultXdr: response.resultXdr?.toXDR('base64'),
          rawResponse: response,
        };
      }
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return { status: 'NOT_FOUND', txHash };
  }

  async executeTwoPhaseSettlement(params: {
    settlementId: number;
    args: SpendOfflineContractArgs;
    relayerSecretKey: string;
  }): Promise<{
    txHash: string;
    pollResult: TransactionPollResult;
    sendResponse: rpc.Api.SendTransactionResponse;
  }> {
    const lockToken = randomUUID();
    const deadline = Date.now() + 20_000;
    while (!(await this.locks.acquire(this.lockKey, lockToken, 30_000))) {
      if (Date.now() >= deadline) throw new Error(`Timeout waiting for relayer lock (settlementId=${params.settlementId})`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    let prepared: PreparedRelayerTransaction;
    let sendResponse: rpc.Api.SendTransactionResponse;
    try {
      prepared = await this.buildAndSignSpendOfflineTx(params.args, params.relayerSecretKey);
      await this.prisma.settlement.update({
        where: { id: params.settlementId },
        data: { txHash: prepared.txHash, signedTxXdr: prepared.signedTxXdr, status: 'PENDING' },
      });
      sendResponse = await this.submitSignedTransaction(prepared.transaction);
    } finally {
      try {
        await this.locks.release(this.lockKey, lockToken);
      } catch (error) {
        this.logger.error('Failed to release relayer lock', error);
      }
    }
    const pollResult = await this.pollTransactionConfirmation(prepared.txHash);
    return { txHash: prepared.txHash, pollResult, sendResponse };
  }
}
