import { Controller, Get, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from '../../common/guards/cron-secret.guard.js';
import { SettlementDrainService, type DrainResult } from './settlement-drain.service.js';

/** Settles whatever is queued, for retries that were delayed by backoff and for jobs a webhook's own drain did not finish. */
@Controller('internal/settlements')
export class SettlementDrainController {
  constructor(private readonly drain: SettlementDrainService) {}

  @Get('drain')
  @UseGuards(CronSecretGuard)
  run(): Promise<DrainResult> {
    return this.drain.drain();
  }
}
