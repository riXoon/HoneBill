import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
import { OtpModule } from '../otp/otp.module.js';
import { SETTLEMENT_QUEUE_NAME } from '../settlements/settlement-queue.constants.js';
import { SmsDispatchSecretGuard } from './guards/sms-dispatch-secret.guard.js';
import { TextbeeSignatureGuard } from './guards/textbee-signature.guard.js';
import { SmsDispatchProcessor } from './processors/sms-dispatch.processor.js';
import { SMS_QUEUE_NAME } from './sms.constants.js';
import { SmsController } from './sms.controller.js';
import { SmsService } from './sms.service.js';

@Module({})
export class SmsModule {
  /** Registers HTTP SMS routes always and BullMQ queues/worker only when queue processing is enabled. */
  static register(queueEnabled: boolean): DynamicModule {
    return {
      module: SmsModule,
      imports: [
        OtpModule,
        ...(queueEnabled
          ? [BullModule.registerQueue({ name: SMS_QUEUE_NAME }, { name: SETTLEMENT_QUEUE_NAME })]
          : []),
      ],
      controllers: [SmsController],
      providers: [
        SmsService,
        TextbeeSignatureGuard,
        SmsDispatchSecretGuard,
        ...(queueEnabled ? [SmsDispatchProcessor] : []),
      ],
      exports: [SmsService],
    };
  }
}
