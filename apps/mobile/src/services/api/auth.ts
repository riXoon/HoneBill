import { apiRequest } from './client';

/**
 * Checks the MPIN against the server (5 wrong tries lock the phone for 15 minutes).
 * It returns no session token: that comes from the SEP-10 sign-in, which needs the wallet key.
 */
export function verifyPin(phone: string, pin: string, signal?: AbortSignal): Promise<{ success: true }> {
  return apiRequest('POST', '/auth/pin/verify', { body: { phoneNumber: phone, pin }, signal });
}
