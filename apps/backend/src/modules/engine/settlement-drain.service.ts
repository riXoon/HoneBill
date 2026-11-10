import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { waitUntil } from '@vercel/functions';
import { Queue, Worker, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { SettlementsService } from '../settlements/settlements.util.js';
import { SmsService } from '../sms/sms.service.js';
import { SettlementJobRunner } from './settlement-job.runner.js';
import { ENGINE_SETTLEMENT_QUEUE, SettlementQueueService } from './settlement-queue.service.js';
import type { SettlementJobData } from '../settlements/settlement-queue.constants.js';

/** The longest one drain keeps working. Keep it under the function's `maxDuration` (vercel.json). */
const DRAIN_BUDGET_MS = 55_000;
/** A settlement can wait ~45 s for the ledger, so a new job is only started when this much of the budget is left. */
const JOB_RESERVE_MS = 45_000;
/** How long a job's lock lasts: longer than any one settlement, so nothing else takes it mid-run. */
const LOCK_DURATION_MS = 60_000;

export type DrainResult = { processed: number; failed: number };

/** The slice of BullMQ's Worker the drain uses; a test supplies a fake. */
export interface ManualWorker {
  getNextJob(token: string, options?: { block?: boolean }): Promise<Job<SettlementJobData> | undefined>;
  close(): Promise<void>;
}

/**
 * Settles queued offline vouchers inside a serverless request, for hosts that cannot keep a worker alive.
 *
 * A BullMQ worker renews its job locks on a timer, but a Vercel function freezes the moment it responds, so the lock
 * expires mid-job ("Missing lock for job"). This pulls jobs by hand instead, and finishes each one before the
 * request's time budget ends. `kick()` runs a drain after the webhook has answered (`waitUntil` keeps the function
 * alive); a cron or any caller of the drain route covers retries that were delayed by backoff.
 *
 * Only used when `QUEUE_WORKER_ENABLED=false`; a host that runs `SettlementProcessor` does not need it.
 */
@Injectable()
export class SettlementDrainService implements OnModuleInit {
  private readonly logger = new Logger(SettlementDrainService.name);
  private readonly runner: SettlementJobRunner;
  private draining: Promise<DrainResult> | null = null;

  constructor(
    @InjectQueue(ENGINE_SETTLEMENT_QUEUE) private readonly queue: Queue,
    private readonly queueService: SettlementQueueService,
    settlements: SettlementsService,
    @Optional() sms?: SmsService,
  ) {
    this.runner = new SettlementJobRunner(settlements, sms);
  }

  /** Every voucher the webhook queues starts a drain once the webhook has answered. */
  onModuleInit(): void {
    this.queueService.onEnqueued(() => this.kick());
  }

  /** Starts a drain that outlives the current response. Never throws. */
  kick(): void {
    waitUntil(this.drain().catch((error: unknown) => {
      this.logger.error(`Settlement drain failed: ${error instanceof Error ? error.message : String(error)}`);
    }));
  }

  /** Settles queued jobs one at a time until the queue is empty or the time budget is used. One drain runs at a time per instance. */
  drain(budgetMs: number = DRAIN_BUDGET_MS): Promise<DrainResult> {
    this.draining ??= this.run(budgetMs).finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  /** The BullMQ worker used only to fetch and finish jobs by hand; it never starts processing on its own. */
  protected async createWorker(): Promise<ManualWorker> {
    return new Worker<SettlementJobData>(ENGINE_SETTLEMENT_QUEUE, undefined, {
      connection: await this.queue.client,
      autorun: false,
      lockDuration: LOCK_DURATION_MS,
    });
  }

  private async run(budgetMs: number): Promise<DrainResult> {
    const deadline = Date.now() + budgetMs;
    const result: DrainResult = { processed: 0, failed: 0 };
    const worker = await this.createWorker();
    try {
      while (deadline - Date.now() >= JOB_RESERVE_MS) {
        const token = randomUUID();
        const job = await worker.getNextJob(token, { block: false });
        if (!job) break;
        try {
          const value = await this.runner.run(job);
          await job.moveToCompleted(value, token, false);
          result.processed += 1;
        } catch (error) {
          // BullMQ applies the job's attempts and backoff, and fails an UnrecoverableError for good.
          await job.moveToFailed(error instanceof Error ? error : new Error(String(error)), token, false);
          result.failed += 1;
        }
      }
    } finally {
      await worker.close();
    }
    if (result.processed + result.failed > 0) {
      this.logger.log(`Settlement drain finished: ${result.processed} settled, ${result.failed} failed or retrying`);
    }
    return result;
  }
}
