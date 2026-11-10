import { cleanEnvValue } from './env-value.js';

/**
 * How a voucher received by the SMS webhook gets to the code that settles it.
 *
 *  - `qstash`: Upstash QStash calls `POST /api/v2/settlements/qstash` once per voucher and retries it on failure. Each
 *    delivery is an ordinary request, so it suits serverless hosts (Vercel), where a long-running worker cannot live.
 *  - `bullmq`: a BullMQ queue in Redis, settled by `SettlementProcessor` on a long-lived host (QUEUE_WORKER_ENABLED=true)
 *    or by `SettlementDrainService` inside requests (QUEUE_WORKER_ENABLED=false). Needs QUEUE_ENABLED=true.
 *  - `none`: no transport; the webhook answers 500 and nothing is settled.
 *
 * Chosen with SETTLEMENT_TRANSPORT. When it is unset, QUEUE_ENABLED=true keeps the original BullMQ behaviour.
 */
export type SettlementTransport = 'qstash' | 'bullmq' | 'none';

export function resolveSettlementTransport(env: NodeJS.ProcessEnv = process.env): SettlementTransport {
  // Hosting dashboards keep quotes pasted from a .env file as part of the value, so strip them as well as spaces.
  const chosen = cleanEnvValue(env.SETTLEMENT_TRANSPORT).toLowerCase();
  if (chosen === 'qstash') return 'qstash';
  if (chosen === 'none') return 'none';
  // `bullmq`, or unset: the queue only exists when Redis queues are switched on.
  return env.QUEUE_ENABLED === 'true' ? 'bullmq' : 'none';
}
