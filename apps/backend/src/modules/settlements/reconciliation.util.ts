import { Injectable } from '@nestjs/common';
import type { SettlementAttempt } from '@prisma/client';
import { rpc, StrKey } from '@stellar/stellar-sdk';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StellarService } from '../../infra/stellar/stellar.service.js';
import { stellarNetworkId } from '../../infra/stellar/network-id.js';
import { withinSettlementDeadline } from './settlement-rpc-deadline.js';
import {
  contractSpendEvents, decodeSpendEvent, isLedgerNumber, isTransactionHash, sameSpend, type SpendPayment,
} from './spend-event.util.js';

type AttemptObservation = { txHash: string; status: 'UNKNOWN' | 'ENVELOPE_EXPIRED' | 'FAILED'; ledger?: number };

export type ReconciliationResult =
  | { status: 'SETTLED'; source: 'RPC_SPEND_EVENT' | 'ARCHIVED_SPEND_EVENT'; txHash: string; ledger: number }
  | { status: 'REVIEW'; reason: 'MISSING_INTENT' | 'EVIDENCE_MISMATCH' }
  | { status: 'PENDING'; attempts: AttemptObservation[] };

const attemptFields = {
  txHash: true, networkId: true, contractId: true, nonce: true, senderAddress: true, receiverAddress: true,
  receiverShortId: true, gatewayAddress: true, tokenContractId: true, amountStroops: true, protocolToll: true,
  maxTime: true, maxLedger: true,
} as const;
type Attempt = Pick<SettlementAttempt, keyof typeof attemptFields>;
type ExpectedSpend = SpendPayment & { txHash: string; contractId: string };
type ConfirmedSpend = Extract<ReconciliationResult, { status: 'SETTLED' }>;

@Injectable()
export class SettlementReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stellar: StellarService,
  ) {}

  /** Reads ledger evidence. The caller owns settlement state transitions. */
  async reconcile(settlementId: number, deadlineAt?: number): Promise<ReconciliationResult> {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: { recoveryReview: true, nonce: true, attempts: { select: attemptFields } },
    });
    if (!settlement || settlement.recoveryReview || !settlement.attempts.length) {
      return { status: 'REVIEW', reason: 'MISSING_INTENT' };
    }

    const networkId = stellarNetworkId(this.stellar.networkPassphrase);
    const nonce = Buffer.from(settlement.nonce, 'base64').toString('base64');
    const expected = settlement.attempts.map((attempt) => expectedSpend(attempt, networkId, nonce));
    if (!expected.every((spend) => spend !== null)) return { status: 'REVIEW', reason: 'MISSING_INTENT' };

    const archived = await this.prisma.settlementSpendEvent.findMany({
      where: { networkId, nonce, contractId: { in: [...new Set(expected.map((spend) => spend.contractId))] } },
      take: 2,
    });
    if (archived.length > 1) return { status: 'REVIEW', reason: 'EVIDENCE_MISMATCH' };
    if (archived.length === 1) {
      const event = archived[0];
      const matches = expected.some((spend) =>
        spend.contractId === event.contractId && spend.txHash === event.txHash && sameSpend(spend, event));
      return matches && isLedgerNumber(Number(event.ledger))
        ? { status: 'SETTLED', source: 'ARCHIVED_SPEND_EVENT', txHash: event.txHash, ledger: Number(event.ledger) }
        : { status: 'REVIEW', reason: 'EVIDENCE_MISMATCH' };
    }

    const rpcServer = this.stellar.sorobanServer;
    const network = await withinSettlementDeadline(() => rpcServer.getNetwork(), deadlineAt).catch(() => null);
    const observed: AttemptObservation[] = [];
    let confirmed: ConfirmedSpend | undefined;
    for (const [index, attempt] of settlement.attempts.entries()) {
      const transaction = network?.passphrase === this.stellar.networkPassphrase
        ? await withinSettlementDeadline(() => rpcServer.getTransaction(attempt.txHash), deadlineAt).catch(() => null)
        : null;
      if (!transaction || transaction.txHash !== attempt.txHash) {
        observed.push({ txHash: attempt.txHash, status: 'UNKNOWN' });
        continue;
      }
      if (transaction.status === rpc.Api.GetTransactionStatus.SUCCESS && isLedgerNumber(transaction.ledger)) {
        const bodies = contractSpendEvents(transaction, expected[index].contractId);
        if (bodies.length) {
          const payment = bodies.length === 1 ? decodeSpendEvent(bodies[0].topics(), bodies[0].data()) : null;
          if (!payment || !sameSpend(expected[index], payment) || confirmed) {
            return { status: 'REVIEW', reason: 'EVIDENCE_MISMATCH' };
          }
          confirmed = { status: 'SETTLED', source: 'RPC_SPEND_EVENT', txHash: attempt.txHash, ledger: transaction.ledger };
          continue;
        }
      }
      observed.push(observeAttempt(attempt, transaction));
    }
    return confirmed ?? { status: 'PENDING', attempts: observed };
  }
}

function expectedSpend(attempt: Attempt, networkId: string, nonce: string): ExpectedSpend | null {
  if (attempt.networkId !== networkId || !attempt.contractId || !StrKey.isValidContract(attempt.contractId) ||
      !attempt.senderAddress || !attempt.receiverAddress || !attempt.gatewayAddress || !attempt.tokenContractId ||
      attempt.protocolToll === null || !isTransactionHash(attempt.txHash) || Buffer.from(nonce, 'base64').length !== 32 ||
      Buffer.from(attempt.nonce, 'base64').toString('base64') !== nonce) return null;
  return {
    txHash: attempt.txHash, contractId: attempt.contractId, nonce, senderAddress: attempt.senderAddress,
    receiverAddress: attempt.receiverAddress, receiverShortId: attempt.receiverShortId, gatewayAddress: attempt.gatewayAddress,
    tokenContractId: attempt.tokenContractId, amountStroops: attempt.amountStroops.toString(), protocolToll: attempt.protocolToll.toString(),
  };
}

function observeAttempt(attempt: Attempt, transaction: rpc.Api.GetTransactionResponse): AttemptObservation {
  const txHash = attempt.txHash;
  if (transaction.status === rpc.Api.GetTransactionStatus.FAILED && isLedgerNumber(transaction.ledger)) {
    return { txHash, status: 'FAILED', ledger: transaction.ledger };
  }
  if (transaction.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    const { latestLedger } = transaction;
    // The wire protocol represents close times as decimal strings, including in some SDK versions typed as numbers.
    const closeTime = String(transaction.latestLedgerCloseTime);
    const pastTime = !!attempt.maxTime && /^\d{1,20}$/.test(closeTime) && BigInt(closeTime) > attempt.maxTime;
    const pastLedger = !!attempt.maxLedger && isLedgerNumber(latestLedger) && BigInt(latestLedger) > attempt.maxLedger;
    // These bounds rule out future inclusion of the envelope. They do not prove what happened before expiry.
    if (pastTime || pastLedger) return { txHash, status: 'ENVELOPE_EXPIRED' };
  }
  return { txHash, status: 'UNKNOWN' };
}
