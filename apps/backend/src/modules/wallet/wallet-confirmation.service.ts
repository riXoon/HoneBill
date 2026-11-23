import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { rpc } from '@stellar/stellar-sdk';
import { ApiResponseException } from '../../common/exceptions/api-response.exception.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { withinSettlementDeadline } from '../settlements/settlement-rpc-deadline.js';
import { matchesWalletEnvelope, verifiedWalletEffect, type WalletEffect } from './wallet-chain-evidence.js';

const verifiedFields = { status: true, confirmedAt: true, confirmedLedger: true, amountStroops: true, tokenId: true, token: { select: { contractId: true } } } as const;

@Injectable()
export class WalletConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
    private readonly config: ConfigService,
  ) {}

  async confirm(kind: WalletEffect['kind'], subject: string, rawHash: string) {
    const txHash = rawHash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(txHash)) throw new BadRequestException('txHash must be a 64-character hexadecimal string');
    // Ownership is part of the lookup so a caller cannot distinguish unrelated and unknown hashes.
    const record = kind === 'move'
      ? await this.prisma.walletMove.findFirst({
          where: { txHash, accountPublicKey: subject },
          select: { ...verifiedFields, accountPublicKey: true, direction: true },
        })
      : await this.prisma.onlineTransfer.findFirst({
          where: { txHash, OR: [{ senderPublicKey: subject }, { recipientPublicKey: subject }] },
          select: { ...verifiedFields, senderPublicKey: true, recipientPublicKey: true },
        });
    if (!record) throw new NotFoundException('Unknown wallet transaction');
    if (record.status === 'SETTLED' && record.confirmedLedger != null) {
      return { txHash, status: record.status, confirmedAt: record.confirmedAt };
    }
    if (record.status === 'FAILED') throw failed(txHash);

    const chain = await this.readTransaction(txHash, Date.now() + 8_000).catch(() => {
      throw new BadGatewayException('Unable to verify transaction with Soroban RPC');
    });
    if (chain.status === rpc.Api.GetTransactionStatus.FAILED && chain.txHash === txHash &&
        matchesWalletEnvelope(chain, txHash, this.stellar.networkPassphrase)) {
      const where = { txHash, status: 'PENDING' as const };
      const data = { status: 'FAILED' as const };
      const update = kind === 'move'
        ? await this.prisma.walletMove.updateMany({ where, data })
        : await this.prisma.onlineTransfer.updateMany({ where, data });
      if (update.count) throw failed(txHash);
    }
    const effect = chain.status === rpc.Api.GetTransactionStatus.SUCCESS ? this.effect(chain, txHash) : null;
    if (!effect || effect.kind !== kind || effect.token !== record.token.contractId || effect.amount !== record.amountStroops ||
        (effect.kind === 'move'
          ? !('accountPublicKey' in record) || effect.sender !== record.accountPublicKey || effect.direction !== record.direction
          : !('senderPublicKey' in record) || effect.sender !== record.senderPublicKey || effect.recipient !== record.recipientPublicKey)) {
      throw pending(txHash);
    }
    const status = await this.prisma.$transaction((tx) => this.persist(tx, effect, record.tokenId, false));
    if (status === 'conflict') throw pending(txHash);
    return { txHash, status: 'SETTLED', confirmedAt: effect.confirmedAt };
  }

  readTransaction(hash: string, deadlineAt: number) {
    return withinSettlementDeadline(() => this.stellar.sorobanServer.getTransaction(hash), deadlineAt);
  }

  effect(chain: rpc.Api.GetSuccessfulTransactionResponse, hash: string): WalletEffect | null {
    return verifiedWalletEffect(chain, hash, this.stellar.networkPassphrase, this.config.getOrThrow<string>('CONTRACT_ID'));
  }

  /** Writes only the verified projection. A concurrent sweep or confirm may already have written it. */
  async persist(tx: Prisma.TransactionClient, effect: WalletEffect, tokenId: number, allowCreate: boolean) {
    const { txHash, amount: amountStroops, confirmedAt, ledger } = effect;
    const identity = { txHash, tokenId, amountStroops };
    const data = { status: 'SETTLED' as const, confirmedAt, confirmedLedger: BigInt(ledger) };
    const eligible = { OR: [{ status: 'PENDING' as const }, { status: 'SETTLED' as const, confirmedLedger: null }] };
    if (effect.kind === 'move') {
      const fields = { ...identity, accountPublicKey: effect.sender, direction: effect.direction };
      const updated = await tx.walletMove.updateMany({ where: { ...fields, ...eligible }, data });
      if (updated.count) return 'updated';
      if (allowCreate && (await tx.walletMove.createMany({ data: { ...fields, ...data, createdAt: confirmedAt }, skipDuplicates: true })).count) return 'created';
      const existing = await tx.walletMove.findFirst({ where: { ...fields, ...data }, select: { id: true } });
      return existing ? 'unchanged' : 'conflict';
    }
    const fields = { ...identity, senderPublicKey: effect.sender, recipientPublicKey: effect.recipient };
    const updated = await tx.onlineTransfer.updateMany({ where: { ...fields, ...eligible }, data });
    if (updated.count) return 'updated';
    if (allowCreate && (await tx.onlineTransfer.createMany({ data: { ...fields, ...data, createdAt: confirmedAt }, skipDuplicates: true })).count) return 'created';
    const existing = await tx.onlineTransfer.findFirst({ where: { ...fields, ...data }, select: { id: true } });
    return existing ? 'unchanged' : 'conflict';
  }
}

function pending(txHash: string) {
  return new ApiResponseException(409, { txHash, status: 'PENDING', error: 'Matching transaction evidence is not available yet' });
}

function failed(txHash: string) {
  return new ApiResponseException(422, { txHash, status: 'FAILED' });
}
