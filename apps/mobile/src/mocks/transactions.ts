/** Mock transaction history for the Transactions tab (Figma 870:3169). */
export type TransactionSource = 'wallet' | 'offline';

export type Transaction = {
  id: string;
  /** Day heading the row sits under, as printed in the design. */
  date: string;
  source: TransactionSource;
  time: string;
  description: string;
  direction: 'in' | 'out';
  amount: number;
  /** Mock-only detail fields for the transaction page; the real ones come from the ledger. */
  counterpartyId: string;
  status: TransactionStatus;
  ref: string;
  /** Service fee charged on top of an outgoing amount. */
  fee: number;
};

export type TransactionStatus = 'completed' | 'pending';

export const TRANSACTION_FILTERS = ['All', 'Wallet', 'Offline Funds'] as const;
export type TransactionFilter = (typeof TRANSACTION_FILTERS)[number];

export const SOURCE_LABEL: Record<TransactionSource, string> = {
  wallet: 'Wallet',
  offline: 'Offline Funds',
};

export const mockTransactions: Transaction[] = [
  { id: 't1', date: 'October 01, 2026', source: 'wallet', time: '1:00 pm', description: 'Deposited from G-Xchange Inc. / Gcash', direction: 'in', amount: 125000, counterpartyId: 'r2', status: 'completed', ref: '482910334', fee: 0 },
  { id: 't2', date: 'October 01, 2026', source: 'offline', time: '3:27 pm', description: 'Deposited from G-Xchange Inc. / Gcash', direction: 'in', amount: 125000, counterpartyId: 'r1', status: 'completed', ref: '482910871', fee: 0 },
  { id: 't3', date: 'September 28, 2026', source: 'offline', time: '10:15 am', description: 'Deposited from G-Xchange Inc. / Gcash', direction: 'in', amount: 125000, counterpartyId: 'r3', status: 'pending', ref: '479203318', fee: 0 },
  { id: 't4', date: 'September 24, 2026', source: 'wallet', time: '2:45 pm', description: 'Sent to G-Xchange Inc. / Gcash', direction: 'out', amount: 125000, counterpartyId: 'r0', status: 'completed', ref: '471882206', fee: 0.5 },
  { id: 't5', date: 'September 24, 2026', source: 'wallet', time: '4:08 pm', description: 'Deposited from G-Xchange Inc. / Gcash', direction: 'in', amount: 125000, counterpartyId: 'r4', status: 'completed', ref: '471880954', fee: 0 },
];

/** A row of the flattened list: a day heading or a transaction. */
export type HistoryRow = { type: 'date'; id: string; label: string } | { type: 'tx'; id: string; tx: Transaction };

export function buildHistoryRows(items: Transaction[], filter: TransactionFilter): HistoryRow[] {
  const rows: HistoryRow[] = [];
  let lastDate = '';
  for (const tx of items) {
    if (filter === 'Wallet' && tx.source !== 'wallet') continue;
    if (filter === 'Offline Funds' && tx.source !== 'offline') continue;
    if (tx.date !== lastDate) {
      rows.push({ type: 'date', id: `d-${tx.date}`, label: tx.date });
      lastDate = tx.date;
    }
    rows.push({ type: 'tx', id: tx.id, tx });
  }
  return rows;
}

export function findTransactionById(id: string): Transaction | undefined {
  return mockTransactions.find((t) => t.id === id);
}
