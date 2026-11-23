import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { rpc, StrKey } from '@stellar/stellar-sdk';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { stellarNetworkId } from '../../infra/stellar/network-id.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { contractSpendEvents, decodeSpendEvent, isLedgerNumber, isTransactionHash, SPEND_TOPIC } from './spend-event.util.js';
import { withinSettlementDeadline } from './settlement-rpc-deadline.js';

const PAGE_SIZE = 8;

export type SpendEventIngestResult =
  | { status: 'INGESTED' | 'UNCHANGED'; inserted: number; cursor: string }
  | { status: 'CURSOR_CHANGED'; inserted: 0 };

@Injectable()
export class SettlementEventIndexService {
  constructor(private readonly prisma: PrismaService, private readonly stellar: StellarService) {}

  /** Ingest one bounded page. The scheduler will call this again with the same scope. */
  async ingestPage(contractId: string, startLedger?: number, deadlineAt?: number): Promise<SpendEventIngestResult> {
    if (!StrKey.isValidContract(contractId)) throw new Error('Invalid settlement contract address.');
    const { networkPassphrase, sorobanServer } = this.stellar;
    const network = await withinSettlementDeadline(() => sorobanServer.getNetwork(), deadlineAt);
    if (network.passphrase !== networkPassphrase) throw new Error('Settlement RPC belongs to a different Stellar network.');

    const scope = { networkId: stellarNetworkId(networkPassphrase), contractId };
    const checkpoint = await this.prisma.settlementEventCursor.findUnique({ where: { networkId_contractId: scope } });
    const cursor = checkpoint?.cursor ?? null;
    const filters: rpc.Api.EventFilter[] = [{ type: 'contract', contractIds: [contractId], topics: [[SPEND_TOPIC, '*', '*']] }];
    if (cursor === null && (startLedger === undefined || !isLedgerNumber(startLedger))) {
      throw new Error('The first settlement event scan needs a starting ledger.');
    }
    // If Stellar has pruned the checkpoint, let the RPC error surface. Restarting at the current tip would hide a gap.
    const page = await withinSettlementDeadline(() => sorobanServer.getEvents(cursor === null
      ? { filters, startLedger: startLedger!, limit: PAGE_SIZE }
      : { filters, cursor, limit: PAGE_SIZE }), deadlineAt);
    if (!page.cursor || (page.cursor === cursor && page.events.length > 0)) {
      throw new Error('Settlement RPC returned an invalid event checkpoint.');
    }
    if (page.cursor === cursor) return { status: 'UNCHANGED', inserted: 0, cursor };

    const evidence: Prisma.SettlementSpendEventCreateManyInput[] = [];
    const transactions = new Map<string, rpc.Api.GetTransactionResponse>();
    for (const event of page.events) {
      if (event.inSuccessfulContractCall === false) continue;
      const payment = decodeSpendEvent(event.topic, event.value);
      if (event.type !== 'contract' || event.contractId?.contractId() !== contractId ||
          !event.id || !isTransactionHash(event.txHash) || !isLedgerNumber(event.ledger) || !payment) {
        throw new Error('Settlement RPC returned an invalid spend event.');
      }

      // Confirm the transaction too. Some RPC versions omit inSuccessfulContractCall on event pages.
      let transaction = transactions.get(event.txHash);
      if (!transaction) {
        transaction = await withinSettlementDeadline(() => sorobanServer.getTransaction(event.txHash), deadlineAt);
        transactions.set(event.txHash, transaction);
      }
      if (transaction.txHash !== event.txHash) throw new Error('Settlement RPC returned a different transaction.');
      if (transaction.status === rpc.Api.GetTransactionStatus.FAILED && transaction.ledger === event.ledger) continue;
      if (transaction.status !== rpc.Api.GetTransactionStatus.SUCCESS || transaction.ledger !== event.ledger ||
          !contractSpendEvents(transaction, contractId).some((body) =>
            body.data().toXDR('base64') === event.value.toXDR('base64') &&
            body.topics().every((topic, i) => topic.toXDR('base64') === event.topic[i]?.toXDR('base64')) &&
            body.topics().length === event.topic.length)) {
        throw new Error('Settlement event could not be confirmed in its transaction.');
      }
      evidence.push({ ...scope, eventId: event.id, txHash: event.txHash, ledger: BigInt(event.ledger), ...payment });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.settlementEventCursor.createMany({ data: [scope], skipDuplicates: true });
      const claimed = await tx.settlementEventCursor.updateMany({ where: { ...scope, cursor }, data: { cursor: page.cursor } });
      if (!claimed.count) return { status: 'CURSOR_CHANGED', inserted: 0 };
      const saved = evidence.length
        ? await tx.settlementSpendEvent.createMany({ data: evidence, skipDuplicates: true })
        : { count: 0 };
      return { status: 'INGESTED', inserted: saved.count, cursor: page.cursor };
    });
  }
}
