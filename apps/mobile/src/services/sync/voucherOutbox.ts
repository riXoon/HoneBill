import type { OutboxRow } from '../../db/schema';
import { ApiError } from '../api/client';
import { settleVoucher, type SettlementResult } from '../api/settlements';
import { en } from '../../i18n/en';
import type { Transaction } from '../../types/transaction';
import { normalizeNonce } from '../walletCache';
import { savedOfflineFeeCents, spendableCents } from '../offline/fees';
import { parseRelayVoucher } from '../offline/voucherFormat';
import { dueRows, enqueue, finishRow, transitionRow } from './outboxStore';

/**
 * Offline vouchers waiting to be settled over the internet (ported from `_legacy/services/syncService.ts` and
 * `_legacy/db/services/paymentQueueDb.ts`).
 *
 * Vouchers sent by SMS or relay are held for review. Only vouchers explicitly approved for online submission are
 * drained. Older pending rows enter review because they have no record of that consent.
 */

const KIND = 'voucher';
/** Gives the SMS gateway time to record a voucher after handoff. */
const GATEWAY_GRACE_MS = 2 * 60_000;
/** Posts per sync, so a phone coming back with a backlog (or many phones at once) does not flood the relayer. */
const MAX_POSTS_PER_DRAIN = 5;

type VoucherPayload = { voucher: string; nonce: string; dispatchedAt?: number; feeCents?: number; assetCode?: string };

export type VoucherReview = {
  row: OutboxRow;
  nonce: string;
  amount: number;
  feeCents: number;
  assetCode: string;
  receiverShortId: string;
  dispatchedAt: number;
};

/** Saves the signed voucher for status checks. Saving it never authorizes submission. */
export function rememberVoucherForReview(
  publicKey: string,
  voucher: string,
  nonce: string,
  dispatchedAt: number,
  feeCents?: number,
  assetCode?: string,
): void {
  const payload: VoucherPayload = { voucher, nonce, dispatchedAt, feeCents, assetCode };
  enqueue(publicKey, KIND, normalizeNonce(nonce), payload);
}

/** Called after a fresh wallet read. In-flight or decided vouchers need no retry offer. */
export function listVoucherReviews(
  publicKey: string,
  history: Transaction[],
  offlineBalance: number,
  now = Date.now(),
): VoucherReview[] {
  const statuses = new Map(
    history.flatMap((tx) => (tx.nonce ? [[normalizeNonce(tx.nonce), tx.status] as const] : [])),
  );
  const reviews: VoucherReview[] = [];
  for (const row of dueRows(publicKey, KIND, now)) {
    const status = statuses.get(row.dedupeKey);
    if (status === 'pending') continue;
    if (status === 'completed' || status === 'failed') {
      finishRow(row, 'done');
      continue;
    }
    const payload = readPayload(row);
    const voucher = payload && parseRelayVoucher(payload.voucher);
    if (!payload || !voucher) {
      finishRow(row, 'failed', 'Unreadable queue entry');
      continue;
    }
    const dispatchedAt = payload.dispatchedAt ?? row.createdAt;
    if (now - dispatchedAt < GATEWAY_GRACE_MS) continue;
    const assetCode = payload.assetCode ?? 'PHPC';
    const feeCents = savedOfflineFeeCents(payload.feeCents, assetCode);
    const requiredCents = Math.round(voucher.amount * 100) + feeCents;
    if (requiredCents > spendableCents(offlineBalance)) continue;
    reviews.push({
      row,
      nonce: payload.nonce,
      amount: voucher.amount,
      feeCents,
      assetCode,
      receiverShortId: voucher.receiverShortId,
      dispatchedAt,
    });
  }
  return reviews;
}

export function acceptVoucherReview(review: VoucherReview): boolean {
  return transitionRow(review.row, 'approved');
}

export function dismissVoucherReview(review: VoucherReview): void {
  transitionRow(review.row, 'done');
}

function readPayload(row: OutboxRow): VoucherPayload | null {
  try {
    const payload = JSON.parse(row.payload) as Partial<VoucherPayload> | null;
    if (typeof payload?.voucher === 'string' && typeof payload.nonce === 'string') {
      return {
        voucher: payload.voucher,
        nonce: payload.nonce,
        ...(Number.isFinite(payload.dispatchedAt) ? { dispatchedAt: payload.dispatchedAt } : {}),
        feeCents: payload.feeCents,
        ...(typeof payload.assetCode === 'string' ? { assetCode: payload.assetCode } : {}),
      };
    }
  } catch {
    // An old or damaged local row cannot be submitted.
  }
  return null;
}

/**
 * What to do with a voucher after one post:
 *  - `settled` / `failed`: the chain has decided (directly, or the gateway got there first).
 *  - `rejected`: the payload can never settle (bad signature, unknown account or token, malformed).
 *  - `later`:    the server cannot settle it right now, but another item may go through (device key not on file yet).
 *  - `stop`:     the server or the network is struggling; end this drain.
 */
type Outcome = 'settled' | 'failed' | 'rejected' | 'later' | 'stop';

export function classify(result: { ok: SettlementResult } | { error: unknown }): Outcome {
  if ('ok' in result) {
    if (result.ok.status === 'SETTLED') return 'settled';
    if (result.ok.status === 'FAILED') return 'failed';
    return 'later';
  }
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

/** A voucher this phone will not try again, with the reason to show on its pending entry. */
export type VoucherGivenUp = { nonce: string; reason: string };

/**
 * The server's rejection in plain words. Never shows internals; the screens add "No money was taken." themselves.
 * Saved on the payment in English, whatever the app's language, and translated when shown (`failureText`).
 */
export function rejectionReason(message: string): string {
  const r = en.tx.reasons;
  if (/recipient.*not found/i.test(message)) return r.noAccount;
  if (/signature/i.test(message)) return r.notVerified;
  if (/offline device key/i.test(message)) return r.notSetUp;
  if (/token/i.test(message)) return r.currency;
  if (/sender account/i.test(message)) return r.senderMissing;
  return r.notAccepted;
}

/**
 * Posts the vouchers this wallet has approved, oldest first. Returns rejections that may need a local History entry.
 */
export async function drainVouchers(publicKey: string, signal: AbortSignal): Promise<{ givenUp: VoucherGivenUp[] }> {
  const givenUp: VoucherGivenUp[] = [];
  const now = Date.now();
  let posts = 0;

  for (const row of dueRows(publicKey, KIND, now, 'approved')) {
    if (signal.aborted || posts >= MAX_POSTS_PER_DRAIN) break;

    const payload = readPayload(row);
    if (!payload) {
      finishRow(row, 'failed', 'Unreadable queue entry');
      continue;
    }

    // Consume the approval before posting. After a timeout or restart check History before offering another attempt.
    if (!transitionRow(row, 'pending', Date.now() + GATEWAY_GRACE_MS)) continue;
    posts += 1;
    let outcome: Outcome;
    let reason = '';
    try {
      outcome = classify({ ok: await settleVoucher(payload.voucher, signal) });
    } catch (error) {
      outcome = classify({ error });
      reason = error instanceof Error ? error.message : String(error);
    }

    if (outcome === 'settled') finishRow(row, 'done');
    else if (outcome === 'failed') finishRow(row, 'failed', 'Failed on-chain');
    else if (outcome === 'rejected') {
      finishRow(row, 'failed', reason);
      givenUp.push({ nonce: payload.nonce, reason: rejectionReason(reason) });
    } else if (outcome === 'stop') break;
  }
  return { givenUp };
}
