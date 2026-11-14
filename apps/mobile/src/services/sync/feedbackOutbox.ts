import type { OutboxRow } from '../../db/schema';
import { ApiError } from '../api/client';
import { submitFeedback, type FeedbackReport } from '../api/feedback';
import { dueRows, enqueue, finishRow, retryRow } from './outboxStore';

/**
 * Help & Feedback reports written without a connection (or whose send failed on a weak one). Saved here, they survive
 * the app being closed and go out on the next sync. The report's `clientId` is the dedupe key here and on the server,
 * so a retried send is stored once.
 */

const KIND = 'feedback';
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
/** A report older than this is no longer useful to send. */
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const MAX_POSTS_PER_DRAIN = 5;

export function enqueueFeedback(publicKey: string, report: FeedbackReport): void {
  enqueue(publicKey, KIND, report.clientId, report);
}

/** Whether a failed send should wait in the queue: no answer, or the server is busy or struggling. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.kind === 'network' || error.kind === 'timeout') return true;
  return error.kind === 'http' && (error.status === 408 || error.status === 429 || error.status >= 500);
}

/** Sends this wallet's queued reports, oldest first. */
export async function drainFeedback(publicKey: string, signal: AbortSignal): Promise<void> {
  const now = Date.now();
  let posts = 0;
  for (const row of dueRows(publicKey, KIND, now)) {
    if (signal.aborted || posts >= MAX_POSTS_PER_DRAIN) break;
    let report: FeedbackReport;
    try {
      report = JSON.parse(row.payload) as FeedbackReport;
    } catch {
      finishRow(row, 'failed', 'Unreadable queue entry');
      continue;
    }
    if (now - row.createdAt > MAX_AGE_MS) {
      finishRow(row, 'failed', 'Expired');
      continue;
    }
    posts += 1;
    try {
      await submitFeedback(report, signal);
      finishRow(row, 'done');
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'aborted') break;
      const reason = error instanceof Error ? error.message : String(error);
      if (isRetryable(error)) {
        retry(row, reason);
        break;
      }
      // The server refused it (e.g. too short after an app update changed the rules): sending again will not help.
      finishRow(row, 'failed', reason);
    }
  }
}

const retry = (row: OutboxRow, reason: string) => retryRow(row, reason, BASE_BACKOFF_MS, MAX_BACKOFF_MS);
