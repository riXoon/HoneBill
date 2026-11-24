import { and, asc, eq, lte } from 'drizzle-orm';

import { getDb } from '../../db/client';
import { outbox, type OutboxRow } from '../../db/schema';

/** Row bookkeeping shared by the outbox kinds (vouchers, settlement confirms). What a row means is up to its kind. */

/** Queues work for a wallet. Queuing the same `(kind, dedupeKey)` again does nothing. */
export function enqueue(publicKey: string, kind: string, dedupeKey: string, payload: unknown): void {
  const now = Date.now();
  getDb()
    .insert(outbox)
    .values({ publicKey, kind, dedupeKey, payload: JSON.stringify(payload), createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .run();
}

/** Rows of the given kind and status whose earliest attempt time has passed, oldest first. */
export function dueRows(publicKey: string, kind: string, now: number): OutboxRow[] {
  return getDb()
    .select()
    .from(outbox)
    .where(and(eq(outbox.publicKey, publicKey), eq(outbox.kind, kind), eq(outbox.status, 'pending'), lte(outbox.nextAttemptAt, now)))
    .orderBy(asc(outbox.createdAt))
    .all();
}

export function finishRow(row: OutboxRow, status: 'done' | 'failed', lastError: string | null = null): void {
  getDb().update(outbox).set({ status, lastError, updatedAt: Date.now() }).where(eq(outbox.id, row.id)).run();
}

/** Counts the attempt and waits `base * 2^(attempts-1)` ms, up to `max`, before the row is due again. */
export function retryRow(row: OutboxRow, reason: string, base: number, max: number): void {
  const attempts = row.attempts + 1;
  const now = Date.now();
  const delay = Math.min(base * 2 ** (attempts - 1), max);
  getDb()
    .update(outbox)
    .set({ attempts, lastError: reason, updatedAt: now, nextAttemptAt: now + delay })
    .where(eq(outbox.id, row.id))
    .run();
}
