import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from '../../common/guards/cron-secret.guard.js';
import { WalletHistoryRecoveryService } from './wallet-history-recovery.service.js';

@Controller('internal/wallet/history')
@UseGuards(CronSecretGuard)
export class WalletHistoryRecoveryController {
  constructor(private readonly recovery: WalletHistoryRecoveryService) {}

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  run() {
    return this.recovery.run();
  }
}
