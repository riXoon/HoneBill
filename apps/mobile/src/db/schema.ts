import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * The phone's local database (ported from `_legacy/db/schema.ts`, reshaped around the live `Transaction` type).
 * Everything is per wallet (`public_key`), and nothing here is secret: amounts, names and references only. Keys and
 * the recovery phrase stay in SecureStore.
 *
 * Changing a table means a new step in `migrations.ts`; never edit a step that has shipped.
 */

/** The last balances the server sent for a wallet, and when its history was last read. */
export const walletState = sqliteTable('wallet_state', {
  publicKey: text('public_key').primaryKey(),
  /** Pesos; `null` when the balance read failed but the history succeeded. */
  onlineBalance: real('online_balance'),
  offlineBalance: real('offline_balance'),
  /** Unix ms of the last successful history read. */
  syncedAt: integer('synced_at').notNull(),
});

/**
 * History entries, in three groups (`origin`):
 *  - `server`:  the last history the server sent (replaced as a whole on each read);
 *  - `pending`: offline payments sent from this phone that the server has not listed yet;
 *  - `move`:    moves between the user's own wallets the server has not listed yet.
 */
export const walletTransactions = sqliteTable(
  'wallet_transactions',
  {
    publicKey: text('public_key').notNull(),
    origin: text('origin', { enum: ['server', 'pending', 'move'] }).notNull(),
    id: text('id').notNull(),
    /** Order within its group, as the list was saved (newest first). */
    position: integer('position').notNull(),
    timestamp: integer('timestamp').notNull(),
    source: text('source', { enum: ['wallet', 'offline'] }).notNull(),
    direction: text('direction', { enum: ['in', 'out'] }).notNull(),
    amount: real('amount').notNull(),
    assetCode: text('asset_code').notNull(),
    description: text('description').notNull(),
    status: text('status', { enum: ['completed', 'pending', 'failed'] }).notNull(),
    ref: text('ref').notNull(),
    nonce: text('nonce'),
    counterpartyShortId: text('counterparty_short_id'),
    mirror: integer('mirror', { mode: 'boolean' }).notNull().default(false),
    failureReason: text('failure_reason'),
  },
  (t) => [primaryKey({ columns: [t.publicKey, t.origin, t.id] }), index('wallet_transactions_list').on(t.publicKey, t.origin, t.position)],
);

/**
 * Work that must reach the server even if the app is closed first: offline vouchers to settle, settlement confirms.
 * The sync service drains it (Phase 4/5 of docs/mobile-sync/plan.md). `dedupeKey` (the voucher nonce, the transaction
 * hash) makes enqueueing the same work twice a no-op, and is what the server deduplicates on too.
 */
export const outbox = sqliteTable(
  'outbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    publicKey: text('public_key').notNull(),
    kind: text('kind').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    /** JSON, shaped by `kind`. */
    payload: text('payload').notNull(),
    status: text('status', { enum: ['pending', 'approved', 'done', 'failed'] }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    /** Unix ms before which a retry is not attempted (backoff). */
    nextAttemptAt: integer('next_attempt_at').notNull().default(0),
  },
  (t) => [uniqueIndex('outbox_dedupe').on(t.kind, t.dedupeKey), index('outbox_due').on(t.publicKey, t.status, t.nextAttemptAt)],
);

export type WalletTransactionRow = typeof walletTransactions.$inferSelect;
export type NewWalletTransactionRow = typeof walletTransactions.$inferInsert;
export type OutboxRow = typeof outbox.$inferSelect;
