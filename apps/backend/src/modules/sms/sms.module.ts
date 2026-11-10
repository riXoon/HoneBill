import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
import { OtpModule } from '../otp/otp.module.js';
import { SettlementQueueModule } from '../engine/settlement-queue.module.js';
import { resolveSettlementTransport } from '../engine/settlement-transport.js';
import { SmsDispatchSecretGuard } from './guards/sms-dispatch-secret.guard.js';
import { TextbeeSignatureGuard } from './guards/textbee-signature.guard.js';
import { SmsDispatchProcessor } from './processors/sms-dispatch.processor.js';
import { SMS_QUEUE_NAME } from './sms.constants.js';
import { SmsController } from './sms.controller.js';
import { SmsService } from './sms.service.js';

@Module({})
export class SmsModule {
  /**
   * Registers HTTP SMS routes always, BullMQ queues when queue processing is enabled, and the queue's worker only
   * when this process is also meant to run workers (see QUEUE_WORKER_ENABLED in engine.module.ts).
   */
  static register(
    queueEnabled: boolean,
    workerEnabled: boolean = queueEnabled && process.env.QUEUE_WORKER_ENABLED !== 'false',
  ): DynamicModule {
    return {
      module: SmsModule,
      imports: [
        OtpModule,
        SettlementQueueModule.register(resolveSettlementTransport()),
        ...(queueEnabled
          ? [BullModule.registerQueue({ name: SMS_QUEUE_NAME })]
          : []),
      ],
      controllers: [SmsController],
      providers: [
        SmsService,
        TextbeeSignatureGuard,
        SmsDispatchSecretGuard,
        ...(workerEnabled ? [SmsDispatchProcessor] : []),
      ],
      exports: [SmsService],
    };
  }
}
