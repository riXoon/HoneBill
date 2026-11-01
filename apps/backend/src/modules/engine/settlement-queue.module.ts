import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
import { SETTLEMENT_QUEUE_NAME } from '../settlements/settlement-queue.constants.js';
import { SettlementQueueService } from './settlement-queue.service.js';

@Module({})
export class SettlementQueueModule {
  static register(enabled: boolean): DynamicModule {
    return {
      module: SettlementQueueModule,
      imports: enabled ? [BullModule.registerQueue({ name: SETTLEMENT_QUEUE_NAME })] : [],
      providers: enabled ? [SettlementQueueService] : [],
      exports: enabled ? [SettlementQueueService] : [],
    };
  }
}
