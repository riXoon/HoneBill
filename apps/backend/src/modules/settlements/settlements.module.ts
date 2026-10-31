import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.util.js';
import { SettlementReconciliationService } from './reconciliation.util.js';
import { TransactionManagerModule } from '../engine/transaction-manager.module.js';

@Module({
  imports: [PrismaModule, TransactionManagerModule],
  controllers: [SettlementsController],
  providers: [SettlementsService, SettlementReconciliationService],
  exports: [SettlementsService, SettlementReconciliationService],
})
export class SettlementsModule {}
