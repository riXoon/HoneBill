import { getSessionToken, invalidateSessionToken } from '../session';
import { ApiError, apiRequest } from './client';

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
  /** The other party's short ID on a payment between HoneBill accounts: who was paid, or who paid. */
  counterpartyShortId?: string;
  /** The credit side of a move between the user's own wallets (the combined list leaves it out). */
  mirror?: boolean;
  /** Plain-language reason, on a FAILED offline payment. */
  failureReason?: string;
};

type AccountRef = { shortId: string; stellarPublicKey: string };

/** Both balances for an account, read from the chain by the backend. */
export function getVaultBalance(account: AccountRef, signal?: AbortSignal): Promise<VaultBalance> {
  return apiRequest('GET', '/vault-balance', { query: { shortId: account.shortId }, signal });
}

/** Newest-first activity across offline settlements, anchor transactions and online transfers. */
export async function getHistory(account: AccountRef, limit = 50, signal?: AbortSignal): Promise<HistoryItem[]> {
  const publicKey = account.stellarPublicKey;
  const read = async (bearer: string) => {
    if (signal?.aborted) throw new ApiError('aborted', 0, 'Request cancelled.');
    const { transactions } = await apiRequest<{ transactions: HistoryItem[] }>('GET', '/wallet/history', {
      // These identifiers also let this build read history from the previous backend during rollout.
      query: { shortId: account.shortId, publicKey, limit: String(limit) },
      bearer,
      signal,
    });
    if (signal?.aborted) throw new ApiError('aborted', 0, 'Request cancelled.');
    if (!Array.isArray(transactions)) throw new Error('Invalid wallet history response.');
    return transactions;
  };

  const token = await getSessionToken(publicKey, signal);
  try {
    return await read(token);
  } catch (error) {
    if (signal?.aborted || !(error instanceof ApiError) || error.kind !== 'http' || error.status !== 401) throw error;
    invalidateSessionToken(publicKey, token);
    return read(await getSessionToken(publicKey, signal));
  }
}

/**
 * Marks a move between the user's own wallets settled once the ledger has it, which is what puts it in History on
 * every device. 409 means the RPC has not indexed it yet (retry); 422 means it failed on-chain.
 */
export function confirmMove(txHash: string, signal?: AbortSignal): Promise<{ txHash: string; status: string }> {
  return apiRequest('POST', '/wallet/moves/confirm', { body: { txHash }, signal });
}

/**
 * Marks an online transfer settled once the ledger has it. 409 means the RPC has not indexed it yet (retry);
 * 422 means it failed on-chain.
 */
export function confirmTransfer(txHash: string, signal?: AbortSignal): Promise<{ txHash: string; status: string }> {
  return apiRequest('POST', '/wallet/transfers/confirm', { body: { txHash }, signal });
}

/**
 * Puts a registered wallet on the Stellar ledger (a small XLM reserve the app never shows). Safe to repeat:
 * an account that is already there answers `exists`. Sign-in with the wallet key (SEP-10) needs this first.
 */
export function fundWallet(publicKey: string, signal?: AbortSignal): Promise<{ status: 'created' | 'exists' }> {
  return apiRequest('POST', '/wallet/fund', { body: { publicKey }, signal });
}
