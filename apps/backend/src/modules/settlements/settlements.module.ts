import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.util.js';
import { SettlementReconciliationService } from './reconciliation.util.js';

@Module({
  imports: [PrismaModule],
  controllers: [SettlementsController],
  providers: [SettlementsService, SettlementReconciliationService],
  exports: [SettlementsService, SettlementReconciliationService],
})
export class SettlementsModule {}
