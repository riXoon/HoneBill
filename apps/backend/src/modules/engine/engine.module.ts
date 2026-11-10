import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { StellarModule } from '../../infra/stellar/stellar.module.js';
import { SettlementsModule } from '../settlements/settlements.module.js';
import { Ed25519SignatureGuard } from '../../common/guards/ed25519-signature.guard.js';
import { EngineController } from './engine.controller.js';
import { EngineService } from './engine.service.js';
import { TransactionManagerModule } from './transaction-manager.module.js';
import { SettlementQueueModule } from './settlement-queue.module.js';
import { SettlementProcessor } from './settlement.processor.js';
import { BullModule } from '@nestjs/bullmq';
import { SettlementDrainController, CronSecretGuard } from './settlement-drain.controller.js';
import { SettlementDrainService } from './settlement-drain.service.js';
import { QStashSignatureGuard, SettlementQStashController } from './settlement-qstash.controller.js';
import { resolveSettlementTransport } from './settlement-transport.js';
import { SETTLEMENT_QUEUE_NAME } from '../settlements/settlement-queue.constants.js';
import { SmsModule } from '../sms/sms.module.js';

/** Which transport settles vouchers: QStash (serverless) or BullMQ (see settlement-transport.ts). */
const settlementTransport = resolveSettlementTransport();
/** Redis-backed BullMQ queues (settlements via BullMQ, and SMS receipts) are registered only with QUEUE_ENABLED=true. */
const queuesEnabled = process.env.QUEUE_ENABLED === 'true';
const settlementQueueEnabled = settlementTransport === 'bullmq';
/**
 * Controls whether this process also runs the workers that take jobs off the queues. A worker needs a process that
 * stays alive (it renews a Redis lock on every job it holds), so it must not run in a serverless function such as
 * Vercel's: set QUEUE_WORKER_ENABLED=false there and run the workers on a long-lived host instead.
 */
const settlementWorkerEnabled = settlementQueueEnabled && process.env.QUEUE_WORKER_ENABLED !== 'false';
/** With the BullMQ queue on but no worker, vouchers are settled by an on-demand drain inside the request instead. */
const settlementDrainEnabled = settlementQueueEnabled && !settlementWorkerEnabled;
/** QStash delivers each voucher to its own route; no queue or worker runs here. */
const qstashEnabled = settlementTransport === 'qstash';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    StellarModule,
    TransactionManagerModule,
    SettlementsModule,
    SettlementQueueModule.register(settlementTransport),
    SmsModule.register(queuesEnabled),
    ...(settlementDrainEnabled ? [BullModule.registerQueue({ name: SETTLEMENT_QUEUE_NAME })] : []),
  ],
  controllers: [
    EngineController,
    ...(settlementDrainEnabled ? [SettlementDrainController] : []),
    ...(qstashEnabled ? [SettlementQStashController] : []),
  ],
  providers: [
    EngineService,
    Ed25519SignatureGuard,
    ...(settlementWorkerEnabled ? [SettlementProcessor] : []),
    ...(settlementDrainEnabled ? [SettlementDrainService, CronSecretGuard] : []),
    ...(qstashEnabled ? [QStashSignatureGuard] : []),
  ],
  exports: [EngineService, SettlementQueueModule],
})
/** Provides engine endpoints and the settlement transport chosen by SETTLEMENT_TRANSPORT. */
export class EngineModule {}
