import Storage from 'expo-sqlite/kv-store';

import type { Transaction } from '../types/transaction';

/**
 * What the phone keeps of an account's activity so History and Home still have something to show with no
 * connection, and after a restart: the last balances and history the server sent, plus the offline payments this
 * phone sent that the server has not settled yet. Amounts and names only; no keys or secrets.
 *
 * Kept per wallet address in expo-sqlite's key-value store. Every function swallows storage errors: a cache that
 * fails to read or write must never break the screen, it just means the next load comes from the network.
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

/** Pending payments older than this are dropped: the text never went out, or the server never settled it. */
const PENDING_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const snapshotKey = (publicKey: string) => `honebill.cache.${publicKey}`;
const pendingKey = (publicKey: string) => `honebill.pending.${publicKey}`;
const movesKey = (publicKey: string) => `honebill.moves.${publicKey}`;

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
    typeof v.status === 'string' &&
    typeof v.ref === 'string'
  );
}

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await Storage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export async function loadSnapshot(publicKey: string): Promise<WalletSnapshot | null> {
  const parsed = (await readJson(snapshotKey(publicKey))) as Partial<WalletSnapshot> | null;
  if (!parsed || !Array.isArray(parsed.transactions) || typeof parsed.savedAt !== 'number') return null;
  const b = parsed.balances;
  const balances = b && typeof b.online === 'number' && typeof b.offline === 'number' ? { online: b.online, offline: b.offline } : null;
  return { balances, transactions: parsed.transactions.filter(isTransaction), savedAt: parsed.savedAt };
}

export async function saveSnapshot(publicKey: string, snapshot: WalletSnapshot): Promise<void> {
  try {
    await Storage.setItem(snapshotKey(publicKey), JSON.stringify(snapshot));
  } catch {
    // The next load simply comes from the network.
  }
}

export async function loadPending(publicKey: string): Promise<PendingOffline[]> {
  const parsed = await readJson(pendingKey(publicKey));
  if (!Array.isArray(parsed)) return [];
  const cutoff = Date.now() - PENDING_MAX_AGE_MS;
  return parsed.filter(
    (item): item is PendingOffline => isTransaction(item) && typeof (item as PendingOffline).nonce === 'string' && item.timestamp >= cutoff,
  );
}

export async function savePending(publicKey: string, pending: PendingOffline[]): Promise<void> {
  try {
    await Storage.setItem(pendingKey(publicKey), JSON.stringify(pending));
  } catch {
    // The payment still settles on the server; it just will not show here until the history reloads.
  }
}

/**
 * Moves between the user's own online and offline wallets that this phone made and the server's history has not
 * listed yet (it lists them once the ledger confirms them). Dropped as soon as the server's copy arrives.
 */
export async function loadMoves(publicKey: string): Promise<Transaction[]> {
  const parsed = await readJson(movesKey(publicKey));
  return Array.isArray(parsed) ? parsed.filter(isTransaction) : [];
}

export async function saveMoves(publicKey: string, moves: Transaction[]): Promise<void> {
  try {
    await Storage.setItem(movesKey(publicKey), JSON.stringify(moves));
  } catch {
    // The server still records the move; this phone's copy just will not survive a restart.
  }
}

/** Removes what this phone kept for a wallet (sign-out), so the next person to use the phone cannot read it. */
export async function clearWalletCache(publicKey: string): Promise<void> {
  try {
    await Promise.all([
      Storage.removeItem(snapshotKey(publicKey)),
      Storage.removeItem(pendingKey(publicKey)),
      Storage.removeItem(movesKey(publicKey)),
    ]);
  } catch {
    // Nothing more to do.
  }
}

/** Voucher nonces are base64 of 32 bytes; the server may or may not keep the padding. */
export function normalizeNonce(nonce: string): string {
  return nonce.replace(/=+$/, '');
}
