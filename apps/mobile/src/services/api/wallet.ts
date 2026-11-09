import { apiRequest } from './client';

export type VaultBalance = {
  /** Online (Stellar account) PHPC balance, in pesos. 0 for an account that has no trustline yet. */
  balancePHP: number;
  /** Offline vault balance held in the Soroban contract, in pesos. */
  offlineBalancePHP: number;
};

export type HistoryItem = {
  id: string;
  type: string;
  /** "OFFLINE" for settled vouchers; "WALLET" for online transfers and anchor top-ups or cash-outs. */
  tag: string;
  title: string;
  /** Signed decimal string: "-12.50" is money out. */
  amount: string;
  assetCode: string;
  status: string;
  /** ISO-8601. */
  timestamp: string;
  txHash?: string;
  nonce?: string;
};

type AccountRef = { shortId: string; stellarPublicKey: string };

/** Both balances for an account, read from the chain by the backend. */
export function getVaultBalance(account: AccountRef, signal?: AbortSignal): Promise<VaultBalance> {
  return apiRequest('GET', '/vault-balance', { query: { shortId: account.shortId }, signal });
}

/** Newest-first activity across offline settlements, anchor transactions and online transfers. */
export async function getHistory(account: AccountRef, limit = 50, signal?: AbortSignal): Promise<HistoryItem[]> {
  const result = await apiRequest<{ transactions: HistoryItem[] }>('GET', '/wallet/history', {
    query: { shortId: account.shortId, publicKey: account.stellarPublicKey, limit: String(limit) },
    signal,
  });
  return result.transactions;
}

/**
 * Puts a registered wallet on the Stellar ledger (a small XLM reserve the app never shows). Safe to repeat:
 * an account that is already there answers `exists`. Sign-in with the wallet key (SEP-10) needs this first.
 */
export function fundWallet(publicKey: string, signal?: AbortSignal): Promise<{ status: 'created' | 'exists' }> {
  return apiRequest('POST', '/wallet/fund', { body: { publicKey }, signal });
}
