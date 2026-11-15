import type { OutboxRow } from '../../db/schema';
import { ApiError } from '../api/client';
import { confirmMove, confirmTransfer } from '../api/wallet';
import { reportError } from '../errorReporting';
import { dueRows, enqueue, finishRow, retryRow } from './outboxStore';

/**
 * Settlement confirms waiting to reach the backend. After a move or an online transfer lands on the ledger, the
 * backend is told (`/wallet/moves/confirm`, `/wallet/transfers/confirm`), which is what lists it in History on every
 * device. The money has already moved, so this only needs to happen eventually: queued here, it survives the app being
 * killed and is retried on every sync. The transaction hash is the dedupe key, and the server treats a repeat as a
 * no-op, so retrying is safe.
 */

export type ConfirmKind = 'confirm_move' | 'confirm_transfer';

const KINDS: ConfirmKind[] = ['confirm_move', 'confirm_transfer'];
const SEND: Record<ConfirmKind, (txHash: string, signal?: AbortSignal) => Promise<unknown>> = {
  confirm_move: confirmMove,
  confirm_transfer: confirmTransfer,
};

/** The RPC usually indexes a transaction within seconds, so "not indexed yet" (409) is retried quickly. */
const INDEXING_BACKOFF_MS = 2_000;
const MAX_INDEXING_BACKOFF_MS = 60_000;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const MAX_AGE_MS = 14 * 24 * 60 * 60_000;
/** Confirms per sync, so a long backlog does not hold up the history read that follows. */
const MAX_POSTS_PER_DRAIN = 10;

type ConfirmPayload = { txHash: string };

/** Queues a confirm for a transaction that is on the ledger. Queuing the same hash again does nothing. */
export function enqueueConfirm(publicKey: string, kind: ConfirmKind, txHash: string): void {
  const payload: ConfirmPayload = { txHash };
  enqueue(publicKey, kind, txHash, payload);
}

/** Outcomes of one post: `done` (confirmed), `failed` (the ledger rejected it), `indexing`, `rejected`, or `stop`. */
type Outcome = 'done' | 'failed' | 'indexing' | 'rejected' | 'stop';

export function classify(error: unknown | null): Outcome {
  if (error === null) return 'done';
  if (!(error instanceof ApiError) || error.kind !== 'http') return 'stop';
  if (error.status === 409) return 'indexing';
  if (error.status === 422) return 'failed';
  // 401/403: the session may be renewed by the next sync, so this is not the confirm's fault.
  if (error.status === 401 || error.status === 403 || error.status === 408 || error.status === 429 || error.status >= 500) return 'stop';
  return error.status >= 400 ? 'rejected' : 'stop';
}

let draining = false;

/**
 * Posts this wallet's due confirms, oldest first. Only one drain runs at a time (a sync and the quick retry after a
 * send would otherwise post the same hash twice); a call made while one is running returns at once.
 */
export async function drainConfirms(publicKey: string, signal?: AbortSignal): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const now = Date.now();
    let posts = 0;
    const rows = KINDS.flatMap((kind) => dueRows(publicKey, kind, now)).sort((a, b) => a.createdAt - b.createdAt);

    for (const row of rows) {
      if (signal?.aborted || posts >= MAX_POSTS_PER_DRAIN) break;
      const kind = row.kind as ConfirmKind;
      if (!SEND[kind]) continue;

      let payload: ConfirmPayload;
      try {
        payload = JSON.parse(row.payload) as ConfirmPayload;
      } catch {
        finishRow(row, 'failed', 'Unreadable queue entry');
        continue;
      }
      // Age alone never drops a confirm: a phone back after weeks offline still sends it (the money has moved, and
      // History only lists it once the backend hears). A repeat is a no-op on the server.
      const tooOld = now - row.createdAt > MAX_AGE_MS;

      posts += 1;
      let error: unknown | null = null;
      try {
        await SEND[kind](payload.txHash, signal);
      } catch (caught) {
        // Cancelled (connection lost, sync stopped): not the confirm's fault, so it does not count as an attempt.
        if (caught instanceof ApiError && caught.kind === 'aborted') break;
        error = caught;
      }

      const outcome = classify(error);
      const reason = error instanceof Error ? error.message : '';
      if (outcome === 'done') finishRow(row, 'done');
      else if (outcome === 'failed') finishRow(row, 'failed', 'Failed on-chain');
      else if (outcome === 'rejected') {
        finishRow(row, 'failed', reason);
        reportError(error, { step: kind, hash: payload.txHash });
      } else if (outcome === 'indexing') {
        // The server answered but still cannot find the transaction, weeks on: stop trying.
        if (tooOld) finishRow(row, 'failed', 'Expired');
        else retryIndexing(row, reason);
      } else {
        retryRow(row, reason, BASE_BACKOFF_MS, MAX_BACKOFF_MS);
        break;
      }
    }
  } finally {
    draining = false;
  }
}

function retryIndexing(row: OutboxRow, reason: string): void {
  retryRow(row, reason, INDEXING_BACKOFF_MS, MAX_INDEXING_BACKOFF_MS);
}

const QUICK_ATTEMPTS = 4;

/**
 * Queues the confirm, then tries it right away a few times while the app is open, because the receipt's History entry
 * should appear within seconds. If the app is killed or the network drops meanwhile, the queued row is picked up by
 * the next sync. Never throws: the money has moved, and this is only bookkeeping.
 */
export async function confirmSoon(publicKey: string, kind: ConfirmKind, txHash: string): Promise<void> {
  try {
    enqueueConfirm(publicKey, kind, txHash);
  } catch (error) {
    reportError(error, { step: kind, hash: txHash });
    return;
  }
  for (let attempt = 0; attempt < QUICK_ATTEMPTS; attempt += 1) {
    try {
      await drainConfirms(publicKey);
    } catch (error) {
      reportError(error, { step: kind, hash: txHash });
      return;
    }
    if (!hasPending(publicKey, kind, txHash)) return;
    await new Promise((resolve) => setTimeout(resolve, INDEXING_BACKOFF_MS * 2 ** attempt));
  }
}

function hasPending(publicKey: string, kind: ConfirmKind, txHash: string): boolean {
  // Due or not: any row still pending after a drain means it is waiting on a retry.
  return dueRows(publicKey, kind, Number.MAX_SAFE_INTEGER).some((row) => row.dedupeKey === txHash);
}
