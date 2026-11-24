import { apiRequest } from './client';

export type SettlementResult = { status: 'SETTLED' | 'FAILED'; txHash: string | null; reason?: string };

/**
 * The backend submits the settlement on-chain and waits for the ledger before answering, which on a cold server or
 * a busy network takes well over the default 15 s. Safe to repeat: the nonce settles once.
 */
const SETTLE_TIMEOUT_MS = 60_000;

/**
 * Settles a signed offline voucher over the internet: the same text the phone sends to the SMS gateway, and the same
 * checks (device-key signature, nonce used once). A voucher the gateway already settled answers 409 with its status.
 */
export function settleVoucher(voucher: string, signal?: AbortSignal): Promise<SettlementResult> {
  return apiRequest('POST', '/settlements', { body: { smsBody: voucher }, signal, timeoutMs: SETTLE_TIMEOUT_MS });
}
