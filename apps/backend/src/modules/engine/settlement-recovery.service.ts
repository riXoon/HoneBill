import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { SettlementEventIndexService } from '../settlements/settlement-event-index.service.js';
import { SettlementFinalizationService } from '../settlements/settlement-finalization.service.js';
import { SettlementsService } from '../settlements/settlements.util.js';
import { SmsService } from '../sms/sms.service.js';
import { SettlementJobRunner } from './settlement-job.runner.js';

const BATCH_SIZE = 12;
const RUN_BUDGET_MS = 40_000;
const ARCHIVE_BUDGET_MS = 12_000;
const CHECK_BUDGET_MS = 4_000;
const RECEIPT_BUDGET_MS = 10_000;

@Injectable()
export class SettlementRecoveryService {
  private readonly logger = new Logger(SettlementRecoveryService.name);
  private readonly notifier?: SettlementJobRunner;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventIndex: SettlementEventIndexService,
    private readonly finalization: SettlementFinalizationService,
    settlements: SettlementsService,
    @Optional() sms?: SmsService,
  ) {
    if (sms) this.notifier = new SettlementJobRunner(settlements, sms);
  }

  async run() {
    const mode = this.config.get<string>('SETTLEMENT_RECONCILE_MODE');
    if (mode !== 'observe' && mode !== 'apply') return { mode: 'off' };
    const deadline = Date.now() + RUN_BUDGET_MS;
    const result = { mode, archived: 0, archiveError: false, checked: 0, matched: 0, settled: 0, pending: 0, review: 0, errors: 0 };
    try {
      const archive = await this.eventIndex.ingestPage(
        this.config.getOrThrow<string>('CONTRACT_ID'),
        this.config.get<number>('SETTLEMENT_RECONCILE_START_LEDGER'),
        Date.now() + ARCHIVE_BUDGET_MS,
      );
      result.archived = archive.inserted;
    } catch {
      result.archiveError = true;
      this.logger.warn('Settlement event ingestion did not advance. Check the starting ledger, RPC retention and connectivity.');
    }

    const now = new Date();
    const candidates = await this.prisma.settlement.findMany({
      where: { status: 'PENDING', recoveryReview: null, txHash: { not: null }, nextReconcileAt: { lte: now },
        OR: [{ recoveryLeaseUntil: null }, { recoveryLeaseUntil: { lte: now } }],
      },
      orderBy: [{ nextReconcileAt: 'asc' }, { id: 'asc' }], take: BATCH_SIZE, select: { id: true },
    });
    // Leave time for a recovered receipt even when the reconciliation backlog is busy.
    const checkDeadline = deadline - (mode === 'apply' && this.notifier ? RECEIPT_BUDGET_MS : 0);
    for (const { id } of candidates) {
      if (Date.now() >= checkDeadline) break;
      const lease = await this.finalization.claim(id, true);
      if (!lease) continue;
      try {
        const { evidence, finalized } = await this.finalization.check(lease, mode === 'apply', Math.min(checkDeadline, Date.now() + CHECK_BUDGET_MS));
        result.checked += 1;
        if (evidence.status === 'SETTLED') result.matched += 1;
        if (evidence.status === 'REVIEW') result.review += 1;
        if (evidence.status === 'PENDING') result.pending += 1;
        if (finalized) result.settled += 1;
      } catch {
        result.errors += 1;
      } finally {
        await this.finalization.release(lease, true).catch(() => { result.errors += 1; });
      }
    }

    if (mode === 'apply' && this.notifier && Date.now() + RECEIPT_BUDGET_MS <= deadline) {
      const receipt = await this.prisma.settlement.findFirst({
        where: { status: 'SETTLED', confirmedLedger: { not: null }, relayReceiptPhone: { not: null } },
        orderBy: { id: 'asc' }, select: { id: true },
      });
      // Picks up the receipt even when the previous invocation stopped after committing the settlement.
      if (receipt) await this.notifier.notifyRecovered(receipt.id).catch(() => { result.errors += 1; });
    }
    this.logger.log(`Settlement reconciliation ${JSON.stringify(result)}`);
    return result;
  }
}
