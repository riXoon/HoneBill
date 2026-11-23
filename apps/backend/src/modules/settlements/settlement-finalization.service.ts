import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SettlementReconciliationService, type ReconciliationResult } from './reconciliation.util.js';

const LEASE_MS = 90_000;
const RECHECK_MS = 60_000;

export type SettlementLease = { id: number; token: string };

@Injectable()
export class SettlementFinalizationService {
  constructor(private readonly prisma: PrismaService, private readonly reconciliation: SettlementReconciliationService) {}

  async claim(id: number, scheduled = false): Promise<SettlementLease | null> {
    const now = new Date();
    const token = randomUUID();
    const claimed = await this.prisma.settlement.updateMany({
      where: {
        id, status: 'PENDING',
        OR: [{ recoveryLeaseUntil: null }, { recoveryLeaseUntil: { lte: now } }],
        ...(scheduled ? { recoveryReview: null, nextReconcileAt: { lte: now } } : {}),
      },
      data: { recoveryLease: token, recoveryLeaseUntil: new Date(now.getTime() + LEASE_MS) },
    });
    return claimed.count ? { id, token } : null;
  }

  async release(lease: SettlementLease, scheduled = false): Promise<void> {
    await this.prisma.settlement.updateMany({
      where: { id: lease.id, recoveryLease: lease.token },
      data: {
        recoveryLease: null, recoveryLeaseUntil: null,
        ...(scheduled ? { nextReconcileAt: new Date(Date.now() + RECHECK_MS) } : {}),
      },
    });
  }

  async check(lease: SettlementLease, apply: boolean, deadlineAt?: number): Promise<{ evidence: ReconciliationResult; finalized: boolean }> {
    const evidence = await this.reconciliation.reconcile(lease.id, deadlineAt);
    if (!apply) return { evidence, finalized: false };

    const owner = { id: lease.id, status: 'PENDING' as const, recoveryLease: lease.token, recoveryLeaseUntil: { gt: new Date() } };
    if (evidence.status === 'SETTLED') {
      const updated = await this.prisma.settlement.updateMany({
        where: { ...owner, recoveryReview: null, attempts: { some: { txHash: evidence.txHash } } },
        data: { status: 'SETTLED', txHash: evidence.txHash, confirmedLedger: BigInt(evidence.ledger), failReason: null },
      });
      return { evidence, finalized: updated.count === 1 };
    }
    if (evidence.status === 'REVIEW') {
      await this.prisma.settlement.updateMany({ where: { ...owner, recoveryReview: null }, data: { recoveryReview: evidence.reason } });
    } else {
      for (const attempt of evidence.attempts) {
        if (attempt.status === 'UNKNOWN') continue;
        await this.prisma.settlementAttempt.updateMany({
          where: {
            settlementId: lease.id, txHash: attempt.txHash, settlement: owner,
            ...(attempt.status === 'FAILED' ? { OR: [{ outcome: null }, { outcome: 'ENVELOPE_EXPIRED' }] } : { outcome: null }),
          },
          data: { outcome: attempt.status, outcomeLedger: attempt.ledger === undefined ? null : BigInt(attempt.ledger) },
        });
      }
    }
    return { evidence, finalized: false };
  }
}
