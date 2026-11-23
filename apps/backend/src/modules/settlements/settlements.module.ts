import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.util.js';
import { SettlementReconciliationService } from './reconciliation.util.js';
import { SettlementEventIndexService } from './settlement-event-index.service.js';
import { SettlementFinalizationService } from './settlement-finalization.service.js';
import { TransactionManagerModule } from '../engine/transaction-manager.module.js';

@Module({
  imports: [PrismaModule, TransactionManagerModule],
  controllers: [SettlementsController],
  providers: [SettlementsService, SettlementReconciliationService, SettlementEventIndexService, SettlementFinalizationService],
  exports: [SettlementsService, SettlementEventIndexService, SettlementFinalizationService],
})
export class SettlementsModule {}
