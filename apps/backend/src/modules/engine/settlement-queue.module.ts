import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
import { SETTLEMENT_QUEUE_NAME } from '../settlements/settlement-queue.constants.js';
import { QStashSettlementPublisher } from './qstash-settlement.publisher.js';
import { SettlementPublisher } from './settlement-publisher.js';
import { SettlementQueueService } from './settlement-queue.service.js';
import type { SettlementTransport } from './settlement-transport.js';

/** Provides `SettlementPublisher` for the chosen transport: QStash, BullMQ, or none. */
@Module({})
export class SettlementQueueModule {
  static register(transport: SettlementTransport): DynamicModule {
    if (transport === 'bullmq') {
      return {
        module: SettlementQueueModule,
        imports: [BullModule.registerQueue({ name: SETTLEMENT_QUEUE_NAME })],
        providers: [SettlementQueueService, { provide: SettlementPublisher, useExisting: SettlementQueueService }],
        exports: [SettlementQueueService, SettlementPublisher],
      };
    }
    if (transport === 'qstash') {
      return {
        module: SettlementQueueModule,
        providers: [QStashSettlementPublisher, { provide: SettlementPublisher, useExisting: QStashSettlementPublisher }],
        exports: [SettlementPublisher],
      };
    }
    return { module: SettlementQueueModule, providers: [], exports: [] };
  }
}
