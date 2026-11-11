import { and, asc, eq, gte } from 'drizzle-orm';
import Storage from 'expo-sqlite/kv-store';

import { getDb, type Database } from '../db/client';
import { walletState, walletTransactions, type NewWalletTransactionRow, type WalletTransactionRow } from '../db/schema';
import type { Transaction } from '../types/transaction';

/**
 * What the phone keeps of an account's activity so History and Home still have something to show with no
 * connection, and after a restart: the last balances and history the server sent, plus the offline payments this
 * phone sent that the server has not settled yet. Amounts and names only; no keys or secrets.
 *
 * Kept per wallet address in the app's SQLite database (`src/db`). Every function swallows storage errors: a cache
 * that fails to read or write must never break the screen, it just means the next load comes from the network.
 */

export type CachedBalances = { online: number; offline: number };

export type WalletSnapshot = {
  balances: CachedBalances | null;
  transactions: Transaction[];
  /** Unix ms of the last successful history read. */
  savedAt: number;
};

/** An offline payment sent from this phone, shown until the server's history lists it. */
export type PendingOffline = Transaction & { nonce: string };

type Origin = WalletTransactionRow['origin'];

/** Pending payments older than this are dropped: the text never went out, or the server never settled it. */
const PENDING_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------------------------
// Rows <-> Transaction
// ---------------------------------------------------------------------------------------------------------------

function toRow(publicKey: string, origin: Origin, tx: Transaction, position: number): NewWalletTransactionRow {
  return {
    publicKey,
    origin,
    id: tx.id,
    position,
    timestamp: tx.timestamp,
    source: tx.source,
    direction: tx.direction,
    amount: tx.amount,
    assetCode: tx.assetCode,
    description: tx.description,
    status: tx.status,
    ref: tx.ref,
    nonce: tx.nonce ?? null,
    counterpartyShortId: tx.counterpartyShortId ?? null,
    mirror: tx.mirror ?? false,
  };
}

/** Optional fields are left out when empty, so a row reads back exactly as the Transaction that was saved. */
function fromRow(row: WalletTransactionRow): Transaction {
  const tx: Transaction = {
    id: row.id,
    timestamp: row.timestamp,
    source: row.source,
    direction: row.direction,
    amount: row.amount,
    assetCode: row.assetCode,
    description: row.description,
    status: row.status,
    ref: row.ref,
  };
  if (row.nonce !== null) tx.nonce = row.nonce;
  if (row.counterpartyShortId !== null) tx.counterpartyShortId = row.counterpartyShortId;
  if (row.mirror) tx.mirror = true;
  return tx;
}

function readGroup(publicKey: string, origin: Origin, since?: number): Transaction[] {
  const filters = [eq(walletTransactions.publicKey, publicKey), eq(walletTransactions.origin, origin)];
  if (since !== undefined) filters.push(gte(walletTransactions.timestamp, since));
  return getDb()
    .select()
    .from(walletTransactions)
    .where(and(...filters))
    .orderBy(asc(walletTransactions.position))
    .all()
    .map(fromRow);
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Replaces one group with `items`, atomically: a crash mid-write leaves the previous list, never half of each. */
function writeGroup(publicKey: string, origin: Origin, items: Transaction[], extra?: (tx: Tx) => void): void {
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(walletTransactions)
      .where(and(eq(walletTransactions.publicKey, publicKey), eq(walletTransactions.origin, origin)))
      .run();
    if (items.length > 0) {
      // A duplicate id in a server list keeps the first copy rather than failing the whole save.
      tx.insert(walletTransactions)
        .values(items.map((item, i) => toRow(publicKey, origin, item, i)))
        .onConflictDoNothing()
        .run();
    }
    extra?.(tx);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// One-time import from the key-value store this cache used before the database
// ---------------------------------------------------------------------------------------------------------------

const legacyKeys = (publicKey: string) => ({
  snapshot: `honebill.cache.${publicKey}`,
  pending: `honebill.pending.${publicKey}`,
  moves: `honebill.moves.${publicKey}`,
});

function isTransaction(value: unknown): value is Transaction {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.timestamp === 'number' &&
    (v.source === 'wallet' || v.source === 'offline') &&
    (v.direction === 'in' || v.direction === 'out') &&
    typeof v.amount === 'number' &&
    typeof v.assetCode === 'string' &&
    typeof v.description === 'string' &&
    (v.status === 'completed' || v.status === 'pending' || v.status === 'failed') &&
    typeof v.ref === 'string'
  );
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Moves a wallet's data from the old key-value copy into the database, then deletes the old copy. Runs once per
 * wallet per app launch (cheap when there is nothing to move). Only fills groups the database does not have yet, so a
 * newer database copy is never overwritten by the old one.
 */
async function importFromKvStore(publicKey: string): Promise<void> {
  const keys = legacyKeys(publicKey);
  const [snapshotRaw, pendingRaw, movesRaw] = await Promise.all([
    Storage.getItem(keys.snapshot),
    Storage.getItem(keys.pending),
    Storage.getItem(keys.moves),
  ]);
  if (snapshotRaw === null && pendingRaw === null && movesRaw === null) return;

  const snapshot = parseJson(snapshotRaw) as Partial<WalletSnapshot> | null;
  if (snapshot && Array.isArray(snapshot.transactions) && typeof snapshot.savedAt === 'number' && !readState(publicKey)) {
    const b = snapshot.balances;
    const balances = b && typeof b.online === 'number' && typeof b.offline === 'number' ? b : null;
    writeSnapshot(publicKey, { balances, transactions: snapshot.transactions.filter(isTransaction), savedAt: snapshot.savedAt });
  }
  const pending = parseJson(pendingRaw);
  if (Array.isArray(pending) && readGroup(publicKey, 'pending').length === 0) {
    writeGroup(
      publicKey,
      'pending',
      pending.filter((p): p is PendingOffline => isTransaction(p) && typeof (p as PendingOffline).nonce === 'string'),
    );
  }
  const moves = parseJson(movesRaw);
  if (Array.isArray(moves) && readGroup(publicKey, 'move').length === 0) {
    writeGroup(publicKey, 'move', moves.filter(isTransaction));
  }

  await Promise.all([Storage.removeItem(keys.snapshot), Storage.removeItem(keys.pending), Storage.removeItem(keys.moves)]);
}

const imports = new Map<string, Promise<void>>();

/** Every read waits for the wallet's import, so the first screen after an update still shows the saved data. */
function ready(publicKey: string): Promise<void> {
  let pending = imports.get(publicKey);
  if (!pending) {
    pending = importFromKvStore(publicKey).catch(() => {
      // The old copy is left in place and tried again next launch; the network fills the screen meanwhile.
    });
    imports.set(publicKey, pending);
  }
  return pending;
}

// ---------------------------------------------------------------------------------------------------------------
// Public API (unchanged from the key-value version)
// ---------------------------------------------------------------------------------------------------------------

function readState(publicKey: string) {
  return getDb().select().from(walletState).where(eq(walletState.publicKey, publicKey)).get();
}

function writeSnapshot(publicKey: string, snapshot: WalletSnapshot): void {
  const state = {
    publicKey,
    onlineBalance: snapshot.balances?.online ?? null,
    offlineBalance: snapshot.balances?.offline ?? null,
    syncedAt: snapshot.savedAt,
  };
  writeGroup(publicKey, 'server', snapshot.transactions, (tx) => {
    tx.insert(walletState).values(state).onConflictDoUpdate({ target: walletState.publicKey, set: state }).run();
  });
}

export async function loadSnapshot(publicKey: string): Promise<WalletSnapshot | null> {
  try {
    await ready(publicKey);
    const state = readState(publicKey);
    if (!state) return null;
    const balances =
      state.onlineBalance !== null && state.offlineBalance !== null
        ? { online: state.onlineBalance, offline: state.offlineBalance }
        : null;
    return { balances, transactions: readGroup(publicKey, 'server'), savedAt: state.syncedAt };
  } catch {
    return null;
  }
}

export async function saveSnapshot(publicKey: string, snapshot: WalletSnapshot): Promise<void> {
  try {
    await ready(publicKey);
    writeSnapshot(publicKey, snapshot);
  } catch {
    // The next load simply comes from the network.
  }
}

export async function loadPending(publicKey: string): Promise<PendingOffline[]> {
  try {
    await ready(publicKey);
    return readGroup(publicKey, 'pending', Date.now() - PENDING_MAX_AGE_MS).filter(
      (item): item is PendingOffline => typeof item.nonce === 'string',
    );
  } catch {
    return [];
  }
}

export async function savePending(publicKey: string, pending: PendingOffline[]): Promise<void> {
  try {
    await ready(publicKey);
    writeGroup(publicKey, 'pending', pending);
  } catch {
    // The payment still settles on the server; it just will not show here until the history reloads.
  }
}

/**
 * Moves between the user's own online and offline wallets that this phone made and the server's history has not
 * listed yet (it lists them once the ledger confirms them). Dropped as soon as the server's copy arrives.
 */
export async function loadMoves(publicKey: string): Promise<Transaction[]> {
  try {
    await ready(publicKey);
    return readGroup(publicKey, 'move');
  } catch {
    return [];
  }
}

export async function saveMoves(publicKey: string, moves: Transaction[]): Promise<void> {
  try {
    await ready(publicKey);
    writeGroup(publicKey, 'move', moves);
  } catch {
    // The server still records the move; this phone's copy just will not survive a restart.
  }
}

/** Removes what this phone kept for a wallet (sign-out), so the next person to use the phone cannot read it. */
export async function clearWalletCache(publicKey: string): Promise<void> {
  try {
    await ready(publicKey);
    const db = getDb();
    db.transaction((tx) => {
      tx.delete(walletTransactions).where(eq(walletTransactions.publicKey, publicKey)).run();
      tx.delete(walletState).where(eq(walletState.publicKey, publicKey)).run();
    });
  } catch {
    // Nothing more to do.
  }
  // An old key-value copy that was never imported goes too.
  const keys = legacyKeys(publicKey);
  await Promise.all([Storage.removeItem(keys.snapshot), Storage.removeItem(keys.pending), Storage.removeItem(keys.moves)]).catch(
    () => {},
  );
}

/** Voucher nonces are base64 of 32 bytes; the server may or may not keep the padding. */
export function normalizeNonce(nonce: string): string {
  return nonce.replace(/=+$/, '');
}
