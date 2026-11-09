import { HORIZON_URL } from '../../config/env';
import { UserFacingError } from '../api/client';

/**
 * The two Horizon calls the app makes: read its own account, and submit a classic transaction (a trustline).
 * Plain fetch, so the SDK's Horizon client (and its EventSource/URL polyfills) stays out of the bundle.
 */
const TIMEOUT_MS = 20_000;

export type HorizonBalance = { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string };
export type HorizonAccount = { id: string; sequence: string; balances: HorizonBalance[] };

async function horizon(path: string, init?: RequestInit): Promise<Response> {
  if (!HORIZON_URL) throw new UserFacingError('The Stellar network address is not set. Add EXPO_PUBLIC_HORIZON_URL to .env.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${HORIZON_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new UserFacingError('Cannot reach the Stellar network. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}

/** `null` when the account is not on the ledger. */
export async function loadAccount(publicKey: string): Promise<HorizonAccount | null> {
  const response = await horizon(`/accounts/${encodeURIComponent(publicKey)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new UserFacingError('The Stellar network did not answer. Please try again.');
  return (await response.json()) as HorizonAccount;
}

/** Submits a signed envelope and resolves with its hash once the ledger has applied it. */
export async function submitTransaction(signedXdr: string): Promise<string> {
  const response = await horizon('/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `tx=${encodeURIComponent(signedXdr)}`,
  });
  const body = (await response.json().catch(() => null)) as {
    hash?: string;
    extras?: { result_codes?: { transaction?: string; operations?: string[] } };
  } | null;
  if (response.ok && body?.hash) return body.hash;

  const codes = body?.extras?.result_codes;
  if (__DEV__) console.log('[horizon] submit failed', response.status, JSON.stringify(codes ?? null));
  if (codes?.transaction === 'tx_insufficient_balance' || codes?.operations?.includes('op_low_reserve')) {
    throw new UserFacingError('Your wallet does not have enough XLM to set up PHPC. Ask support to top up your wallet.');
  }
  throw new UserFacingError(`The Stellar network rejected the request${codes?.transaction ? ` (${codes.transaction})` : ''}.`);
}
