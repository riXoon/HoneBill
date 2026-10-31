import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { StellarModule } from '../../infra/stellar/stellar.module.js';
import { SettlementsModule } from '../settlements/settlements.module.js';
import { Ed25519SignatureGuard } from '../../common/guards/ed25519-signature.guard.js';
import { EngineController } from './engine.controller.js';
import { EngineService } from './engine.service.js';
import { TransactionManagerModule } from './transaction-manager.module.js';
import { ENGINE_SETTLEMENT_QUEUE, SettlementQueueService } from './settlement-queue.service.js';
import { SettlementProcessor } from './settlement.processor.js';

const settlementQueueEnabled = process.env.QUEUE_ENABLED === 'true';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    StellarModule,
    TransactionManagerModule,
    SettlementsModule,
    ...(settlementQueueEnabled ? [BullModule.registerQueue({ name: ENGINE_SETTLEMENT_QUEUE })] : []),
  ],
  controllers: [EngineController],
  providers: [
    EngineService,
    Ed25519SignatureGuard,
    ...(settlementQueueEnabled ? [SettlementQueueService, SettlementProcessor] : []),
  ],
  exports: [EngineService, ...(settlementQueueEnabled ? [SettlementQueueService] : [])],
})
export class EngineModule {}
