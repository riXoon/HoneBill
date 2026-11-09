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
import { SmsModule } from '../sms/sms.module.js';

/** Controls whether BullMQ settlement and SMS workers are registered at startup. */
const settlementQueueEnabled = process.env.QUEUE_ENABLED === 'true';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    StellarModule,
    TransactionManagerModule,
    SettlementsModule,
    SettlementQueueModule.register(settlementQueueEnabled),
    SmsModule.register(settlementQueueEnabled),
  ],
  controllers: [EngineController],
  providers: [
    EngineService,
    Ed25519SignatureGuard,
    ...(settlementQueueEnabled ? [SettlementProcessor] : []),
  ],
  exports: [EngineService, SettlementQueueModule],
})
/** Provides engine endpoints and, when enabled, the settlement queue worker. */
export class EngineModule {}
