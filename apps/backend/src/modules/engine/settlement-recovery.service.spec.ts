import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { SettlementEventIndexService } from '../settlements/settlement-event-index.service.js';
import { SettlementFinalizationService } from '../settlements/settlement-finalization.service.js';
import type { SettlementReconciliationService } from '../settlements/reconciliation.util.js';
import type { SettlementsService } from '../settlements/settlements.util.js';
import { SettlementRecoveryController } from './settlement-recovery.controller.js';
import { SettlementRecoveryService } from './settlement-recovery.service.js';

const settled = { status: 'SETTLED', source: 'RPC_SPEND_EVENT', txHash: 'fixture-hash', ledger: 42 } as const;
const lease = { id: 1, token: 'fixture-lease' };

function fixture(mode: 'off' | 'observe' | 'apply' = 'apply') {
  const prisma = { settlement: {
    findMany: jest.fn(async () => [{ id: 1 }]),
    updateMany: jest.fn<(query: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
  }, settlementAttempt: { updateMany: jest.fn<(query: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }) } };
  const reconciler = { reconcile: jest.fn<() => Promise<unknown>>().mockResolvedValue(settled) };
  const eventIndex = { ingestPage: jest.fn<(contractId: string, startLedger?: number, deadlineAt?: number) => Promise<unknown>>()
    .mockResolvedValue({ inserted: 1 }) };
  const db = prisma as unknown as PrismaService;
  const finalization = new SettlementFinalizationService(db, reconciler as unknown as SettlementReconciliationService);
  const recovery = new SettlementRecoveryService(
    db, new ConfigService({ SETTLEMENT_RECONCILE_MODE: mode, CONTRACT_ID: 'fixture-contract', SETTLEMENT_RECONCILE_START_LEDGER: 10 }),
    eventIndex as unknown as SettlementEventIndexService, finalization, {} as SettlementsService,
  );
  return { prisma, reconciler, eventIndex, finalization, recovery };
}

describe('scheduled settlement recovery', () => {
  it('does no work unless the scheduler is enabled', async () => {
    const f = fixture('off');
    await expect(f.recovery.run()).resolves.toEqual({ mode: 'off' });
    expect(f.prisma.settlement.findMany).not.toHaveBeenCalled();
    expect(f.eventIndex.ingestPage).not.toHaveBeenCalled();
  });

  it('observe mode ingests and verifies evidence without writing settlement outcomes', async () => {
    const f = fixture('observe');
    await expect(f.recovery.run()).resolves.toMatchObject({ mode: 'observe', archived: 1, checked: 1, matched: 1, settled: 0 });
    expect(f.eventIndex.ingestPage).toHaveBeenCalledWith('fixture-contract', 10, expect.any(Number));
    expect(f.prisma.settlement.updateMany).toHaveBeenCalledTimes(2); // claim and schedule next check
    expect(f.prisma.settlementAttempt.updateMany).not.toHaveBeenCalled();
  });

  it('applies a verified result under the claim even if archive ingestion is temporarily unavailable', async () => {
    const f = fixture();
    f.eventIndex.ingestPage.mockRejectedValue(new Error('RPC retention gap'));
    await expect(f.recovery.run()).resolves.toMatchObject({ archiveError: true, checked: 1, settled: 1 });
    expect(f.prisma.settlement.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 1, status: 'PENDING', recoveryLease: expect.any(String), recoveryLeaseUntil: { gt: expect.any(Date) },
        recoveryReview: null, attempts: { some: { txHash: settled.txHash } },
      },
      data: { status: 'SETTLED', txHash: settled.txHash, confirmedLedger: 42n, failReason: null },
    });
  });

  it('skips occupied claims and will not report finalization after a claim is lost', async () => {
    const f = fixture();
    f.prisma.settlement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(f.recovery.run()).resolves.toMatchObject({ checked: 0, settled: 0 });
    expect(f.reconciler.reconcile).not.toHaveBeenCalled();
    f.prisma.settlement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(f.finalization.check(lease, true)).resolves.toEqual({ evidence: settled, finalized: false });
  });

  it('records an expired attempt while keeping the voucher pending', async () => {
    const f = fixture();
    f.reconciler.reconcile.mockResolvedValue({ status: 'PENDING', attempts: [{ txHash: 'fixture-hash', status: 'ENVELOPE_EXPIRED' }] });
    await expect(f.recovery.run()).resolves.toMatchObject({ pending: 1, settled: 0 });
    expect(f.prisma.settlement.updateMany).toHaveBeenCalledTimes(2);
    expect(f.prisma.settlementAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { outcome: 'ENVELOPE_EXPIRED', outcomeLedger: null },
    }));
  });
});

describe('QStash scheduler HTTP route', () => {
  let app: INestApplication;
  const config = new ConfigService({ CRON_SECRET: 'fixture-schedule-secret' });
  const recovery = { run: jest.fn(async () => ({ mode: 'observe' })) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SettlementRecoveryController],
      providers: [{ provide: ConfigService, useValue: config }, { provide: SettlementRecoveryService, useValue: recovery }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v2');
    await app.init();
  });
  afterAll(async () => app?.close());

  it('works without a worker provider and requires the schedule secret', async () => {
    const post = () => request(app.getHttpServer()).post('/api/v2/internal/settlements/reconcile').send({});
    await post().expect(401);
    await post().set('Authorization', 'Bearer wrong-secret').expect(401);
    expect(recovery.run).not.toHaveBeenCalled();
    await post().set('Authorization', 'Bearer fixture-schedule-secret').expect(200, { mode: 'observe' });
    expect(recovery.run).toHaveBeenCalledTimes(1);
  });
});
