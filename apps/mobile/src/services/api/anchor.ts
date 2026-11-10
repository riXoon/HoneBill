import { apiRequest } from './client';

/**
 * The anchor's deposit ("top-up"). The SEP-24 way is a web page; on testnet the backend can also settle a deposit
 * directly (`simulate-payment`), paying PHPC from the distributor to the wallet, so the app needs no web page.
 */
const SLOW_MS = 60_000;

/** `url` carries the one-time interactive `token` the settle call needs. `id` is the anchor transaction. */
export function startDeposit(sessionToken: string, signal?: AbortSignal): Promise<{ type: string; url: string; id: string }> {
  return apiRequest('POST', '/sep24/transactions/deposit/interactive', {
    body: { asset_code: 'PHPC' },
    bearer: sessionToken,
    signal,
    timeoutMs: SLOW_MS,
  });
}

export type DepositResult = { success: true; stellar_tx_hash: string; amount: string; asset_code: string; destination: string };

/** The wallet needs a PHPC trustline first, or the payment fails. 409 means this deposit was already settled. */
export function settleDeposit(
  body: { transaction_id: string; amount: string; token: string },
  signal?: AbortSignal,
): Promise<DepositResult> {
  return apiRequest('POST', '/anchor/simulate-payment', { body, signal, timeoutMs: SLOW_MS });
}
