import { Controller, HttpCode, HttpStatus, Logger, Optional, Post, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from '../../common/guards/cron-secret.guard.js';
import { SettlementRecoveryService } from './settlement-recovery.service.js';
import { SmsVoucherRecoveryService } from '../sms/sms-voucher-recovery.service.js';

@Controller('internal/settlements')
export class SettlementRecoveryController {
  private readonly logger = new Logger(SettlementRecoveryController.name);

  constructor(private readonly recovery: SettlementRecoveryService, @Optional() private readonly smsHistory?: SmsVoucherRecoveryService) {}

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CronSecretGuard)
  async run() {
    const [settlements, smsHistory] = await Promise.all([
      this.recovery.run(),
      this.smsHistory?.run().catch(() => {
        this.logger.warn('TextBee history scan failed; the next scheduled run will retry it.');
        return { status: 'error' };
      }),
    ]);
    return smsHistory ? { ...settlements, smsHistory } : settlements;
  }
}
