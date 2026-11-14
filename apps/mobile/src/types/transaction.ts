import { formatDayHeading, shortRef, voucherRef } from '../utils/format';

export type TransactionSource = 'wallet' | 'offline';
export type TransactionStatus = 'completed' | 'pending' | 'failed';

/** One ledger entry as the History screens show it. */
export type Transaction = {
  id: string;
  /** Unix ms. */
  timestamp: number;
  source: TransactionSource;
  direction: 'in' | 'out';
  /** Always positive; `direction` carries the sign. */
  amount: number;
  assetCode: string;
  /** What the backend calls it, e.g. "Sent to Ana". */
  description: string;
  status: TransactionStatus;
  /** The Stellar transaction hash when there is one, otherwise the settlement nonce or record id. */
  ref: string;
  /** The offline voucher's nonce when the server sent one; it matches a payment sent from this phone to its record. */
  nonce?: string;
  /** The other party's short ID on a payment between HoneBill accounts. */
  counterpartyShortId?: string;
  /** The credit side of a move between the user's own wallets. History's "All" list shows the move once, by its debit side. */
  mirror?: boolean;
  /** Why a failed payment did not go through, in plain words (from the server, or from this phone's own check). */
  failureReason?: string;
};

/**
 * What to tell the person about a failed entry. A failed offline voucher never settled, so no money left the vault;
 * other kinds only show the reason, since a failed top-up or cash-out is not guaranteed to have moved nothing.
 */
export function failureText(tx: Pick<Transaction, 'source' | 'failureReason'>): string {
  const reason = tx.failureReason ?? '';
  // An expired payment was never answered, so nobody knows that no money moved; its reason says how to check.
  if (tx.source !== 'offline' || reason === EXPIRED_REASON) return reason;
  return reason ? `${reason} No money was taken.` : 'No money was taken.';
}

/** Shown on an offline payment nobody confirmed within 14 days; the phone stops trying to settle it then too. */
export const EXPIRED_REASON =
  'It was not confirmed within 14 days, so it will not be tried again. Check your balance before sending it again.';

/** A reference a person can read: an offline voucher's matches the texts the gateway sends about it. */
export function displayRef(tx: Pick<Transaction, 'source' | 'ref' | 'nonce'>): string {
  return tx.source === 'offline' && tx.nonce ? voucherRef(tx.nonce) : shortRef(tx.ref);
}

export const TRANSACTION_FILTERS = ['All', 'Wallet', 'Offline Funds'] as const;
export type TransactionFilter = (typeof TRANSACTION_FILTERS)[number];

export const SOURCE_LABEL: Record<TransactionSource, string> = {
  wallet: 'Wallet',
  offline: 'Offline Funds',
};

/** A row of the flattened list: a day heading or a transaction. */
export type HistoryRow = { type: 'date'; id: string; label: string } | { type: 'tx'; id: string; tx: Transaction };

/** Groups newest-first transactions under day headings, after applying the filter. */
export function buildHistoryRows(items: Transaction[], filter: TransactionFilter): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let lastDate = '';
  for (const tx of items) {
    if (filter === 'Wallet' && tx.source !== 'wallet') continue;
    if (filter === 'Offline Funds' && tx.source !== 'offline') continue;
    if (filter === 'All' && tx.mirror) continue;
    const label = formatDayHeading(new Date(tx.timestamp));
    if (label !== lastDate) {
      rows.push({ type: 'date', id: `d-${label}`, label });
      lastDate = label;
    }
    rows.push({ type: 'tx', id: tx.id, tx });
  }
  return rows;
}
