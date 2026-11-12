import type { OutboxRow } from '../../db/schema';
import { ApiError } from '../api/client';
import { settleVoucher, type SettlementResult } from '../api/settlements';
import { normalizeNonce } from '../walletCache';
import { dueRows, enqueue, finishRow, retryRow } from './outboxStore';

/**
 * Offline vouchers waiting to be settled over the internet (ported from `_legacy/services/syncService.ts` and
 * `_legacy/db/services/paymentQueueDb.ts`).
 *
 * A voucher is queued once the sender says the text went out. From then on two paths race to settle it: the SMS
 * gateway, and this queue whenever the phone is online. The contract settles a nonce once, so whichever arrives second
 * gets "already settled" (409) and nothing is paid twice. The queue survives sign-out and restarts: the money is
 * committed, so it is settled the next time this wallet is signed in on this phone.
 *
 * The queue never decides balances or history. Those always come from the server's reading of the chain; the queue
 * only makes the chain hear about the payment sooner.
 */

const KIND = 'voucher';
/** Posts per sync, so a phone coming back with a backlog (or many phones at once) does not flood the relayer. */
const MAX_POSTS_PER_DRAIN = 5;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
/** Matches how long History shows a pending payment: after this, the voucher is not tried again. */
const MAX_AGE_MS = 14 * 24 * 60 * 60_000;

type VoucherPayload = { voucher: string; nonce: string };

/** Queues a voucher for settlement. Queuing the same nonce again does nothing. */
export function enqueueVoucher(publicKey: string, voucher: string, nonce: string): void {
  const payload: VoucherPayload = { voucher, nonce };
  enqueue(publicKey, KIND, normalizeNonce(nonce), payload);
}

const due = (publicKey: string, now: number) => dueRows(publicKey, KIND, now);
const finish = finishRow;
const retryLater = (row: OutboxRow, reason: string) => retryRow(row, reason, BASE_BACKOFF_MS, MAX_BACKOFF_MS);

/**
 * What to do with a voucher after one post:
 *  - `settled` / `failed`: the chain has decided (directly, or the gateway got there first).
 *  - `rejected`: the payload can never settle (bad signature, unknown account or token, malformed).
 *  - `later`:    the server cannot settle it right now, but another item may go through (device key not on file yet).
 *  - `stop`:     the server or the network is struggling; back off and end this drain.
 */
type Outcome = 'settled' | 'failed' | 'rejected' | 'later' | 'stop';

export function classify(result: { ok: SettlementResult } | { error: unknown }): Outcome {
  if ('ok' in result) return result.ok.status === 'FAILED' ? 'failed' : 'settled';
  const error = result.error;
  if (!(error instanceof ApiError) || error.kind !== 'http') return 'stop';
  if (error.status === 409) {
    const status = error.data?.status;
    if (status === 'SETTLED') return 'settled';
    if (status === 'FAILED') return 'failed';
    return 'later';
  }
  if (error.status === 408 || error.status === 429 || error.status >= 500) return 'stop';
  if (error.status >= 400) return 'rejected';
  return 'stop';
}

/**
 * Posts this wallet's due vouchers, oldest first. Returns the nonces that can never settle, so the pending entries
 * for them can say so; settled and failed ones need nothing, the next history read lists them from the chain.
 */
export async function drainVouchers(publicKey: string, signal: AbortSignal): Promise<{ rejectedNonces: string[] }> {
  const rejectedNonces: string[] = [];
  const now = Date.now();
  let posts = 0;

  for (const row of due(publicKey, now)) {
    if (signal.aborted || posts >= MAX_POSTS_PER_DRAIN) break;

    let payload: VoucherPayload;
    try {
      payload = JSON.parse(row.payload) as VoucherPayload;
    } catch {
      finish(row, 'failed', 'Unreadable queue entry');
      continue;
    }
    if (now - row.createdAt > MAX_AGE_MS) {
      finish(row, 'failed', 'Expired');
      continue;
    }

    posts += 1;
    let outcome: Outcome;
    let reason = '';
    try {
      outcome = classify({ ok: await settleVoucher(payload.voucher, signal) });
    } catch (error) {
      // Cancelled (connection lost, sync stopped): not the voucher's fault, so it does not count as an attempt.
      if (error instanceof ApiError && error.kind === 'aborted') break;
      outcome = classify({ error });
      reason = error instanceof Error ? error.message : String(error);
    }

    if (outcome === 'settled') finish(row, 'done');
    else if (outcome === 'failed') finish(row, 'failed', 'Failed on-chain');
    else if (outcome === 'rejected') {
      finish(row, 'failed', reason);
      rejectedNonces.push(payload.nonce);
    } else if (outcome === 'later') retryLater(row, reason);
    else {
      retryLater(row, reason);
      break;
    }
  }
  return { rejectedNonces };
}
