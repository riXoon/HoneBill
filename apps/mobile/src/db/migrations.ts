import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Schema steps, applied in order. `PRAGMA user_version` records how many have run, so each runs once per install and
 * an upgrade runs only the new ones. Append a step for every change; never edit or reorder one that has shipped. The
 * SQL must match `schema.ts`.
 */
const STEPS: string[] = [
  // 1: wallet cache and outbox.
  `
  CREATE TABLE wallet_state (
    public_key      TEXT PRIMARY KEY NOT NULL,
    online_balance  REAL,
    offline_balance REAL,
    synced_at       INTEGER NOT NULL
  );

  CREATE TABLE wallet_transactions (
    public_key            TEXT    NOT NULL,
    origin                TEXT    NOT NULL,
    id                    TEXT    NOT NULL,
    position              INTEGER NOT NULL,
    timestamp             INTEGER NOT NULL,
    source                TEXT    NOT NULL,
    direction             TEXT    NOT NULL,
    amount                REAL    NOT NULL,
    asset_code            TEXT    NOT NULL,
    description           TEXT    NOT NULL,
    status                TEXT    NOT NULL,
    ref                   TEXT    NOT NULL,
    nonce                 TEXT,
    counterparty_short_id TEXT,
    mirror                INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (public_key, origin, id)
  );
  CREATE INDEX wallet_transactions_list ON wallet_transactions (public_key, origin, position);

  CREATE TABLE outbox (
    id              INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    public_key      TEXT    NOT NULL,
    kind            TEXT    NOT NULL,
    dedupe_key      TEXT    NOT NULL,
    payload         TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending',
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    next_attempt_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX outbox_dedupe ON outbox (kind, dedupe_key);
  CREATE INDEX outbox_due ON outbox (public_key, status, next_attempt_at);
  `,
];

/** Brings the database up to the latest step. Each step and its version bump commit together, or not at all. */
export function migrate(database: SQLiteDatabase): void {
  const row = database.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let version = current; version < STEPS.length; version += 1) {
    database.withTransactionSync(() => {
      database.execSync(STEPS[version]);
      // PRAGMA takes no bound parameters; `version + 1` is a number from this loop, never input.
      database.execSync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
