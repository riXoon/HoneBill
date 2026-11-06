import type { HistoryItem } from './api/wallet';
import type { Transaction, TransactionSource, TransactionStatus } from '../types/transaction';

/** Settlement and transfer statuses (SETTLED, PENDING, FAILED) and anchor statuses (completed, error, pending_*, incomplete). */
function statusOf(raw: string): TransactionStatus {
  const status = raw.trim().toLowerCase();
  if (status === 'settled' || status === 'completed' || status === 'confirmed') return 'completed';
  if (status === 'failed' || status === 'error') return 'failed';
  return 'pending';
}

/** `null` for an entry the screens could not show truthfully (unreadable amount or date). */
export function toTransaction(item: HistoryItem): Transaction | null {
  const signed = Number(item.amount);
  const timestamp = Date.parse(item.timestamp);
  if (!Number.isFinite(signed) || Number.isNaN(timestamp)) return null;

  const source: TransactionSource = item.tag === 'OFFLINE' ? 'offline' : 'wallet';
  return {
    id: item.id,
    timestamp,
    source,
    direction: item.amount.trim().startsWith('-') ? 'out' : 'in',
    amount: Math.abs(signed),
    assetCode: item.assetCode,
    description: item.title,
    status: statusOf(item.status),
    ref: item.txHash ?? item.nonce ?? item.id,
  };
}

export function toTransactions(items: HistoryItem[]): Transaction[] {
  return items.flatMap((item) => {
    const tx = toTransaction(item);
    return tx ? [tx] : [];
  });
}
