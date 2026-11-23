import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from '../../common/guards/cron-secret.guard.js';
import { SettlementRecoveryService } from './settlement-recovery.service.js';

@Controller('internal/settlements')
export class SettlementRecoveryController {
  constructor(private readonly recovery: SettlementRecoveryService) {}

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CronSecretGuard)
  run() {
    return this.recovery.run();
  }
}
