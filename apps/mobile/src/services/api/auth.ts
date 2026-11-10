import { apiRequest } from './client';

/**
 * Checks the MPIN against the server (5 wrong tries lock the phone for 15 minutes).
 * It returns no session token: that comes from the SEP-10 sign-in below, which needs the wallet key.
 */
export function verifyPin(phone: string, pin: string, signal?: AbortSignal): Promise<{ success: true }> {
  return apiRequest('POST', '/auth/pin/verify', { body: { phoneNumber: phone, pin }, signal });
}

/** SEP-10 step 1: a challenge transaction (sequence 0, never submittable) for the wallet to sign. */
export function getAuthChallenge(
  account: string,
  signal?: AbortSignal,
): Promise<{ transaction: string; network_passphrase: string }> {
  return apiRequest('GET', '/auth', { query: { account }, signal });
}

/** SEP-10 step 2: the signed challenge for a JWT whose subject is the wallet address. */
export function exchangeAuthChallenge(transaction: string, signal?: AbortSignal): Promise<{ token: string }> {
  return apiRequest('POST', '/auth', { body: { transaction }, signal });
}
