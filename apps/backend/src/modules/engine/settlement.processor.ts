import { Injectable, Optional } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { SettlementsService } from '../settlements/settlements.util.js';
import { SmsService } from '../sms/sms.service.js';
import { SettlementJobRunner } from './settlement-job.runner.js';
import { ENGINE_SETTLEMENT_QUEUE } from './settlement-queue.service.js';
import type { SettlementJobData } from '../settlements/settlement-queue.constants.js';

/**
 * The long-lived settlement worker. Only for a process that stays alive (Docker, a VM): it holds a Redis lock on each
 * job and renews it on a timer, which a serverless function cannot do. On Vercel use `SettlementDrainService`.
 */
// A settlement waits for the ledger (up to ~45 s), so the lock outlives that; the worker renews it while it runs.
@Processor(ENGINE_SETTLEMENT_QUEUE, { lockDuration: 60_000 })
@Injectable()
export class SettlementProcessor extends WorkerHost {
  private readonly runner: SettlementJobRunner;

  /** Creates the worker with settlement processing and optional SMS receipt delivery. */
  constructor(
    settlements: SettlementsService,
    @Optional() sms?: SmsService,
  ) {
    super();
    this.runner = new SettlementJobRunner(settlements, sms);
  }

  process(job: Job<SettlementJobData>) {
    return this.runner.run(job);
  }
}
