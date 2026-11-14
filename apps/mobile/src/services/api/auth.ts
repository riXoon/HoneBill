import { ApiError, apiRequest } from './client';

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

/** Replaces the MPIN. The server checks the current one first (the same 5-tries lockout as sign-in). */
/** `verificationToken` is the proof `POST /otp/verify` returns; the server requires it for a PIN change. */
export function changePin(
  phone: string,
  currentPin: string,
  newPin: string,
  verificationToken: string | undefined,
  signal?: AbortSignal,
): Promise<{ success: true }> {
  return apiRequest('POST', '/auth/pin/change', {
    body: { phoneNumber: phone, currentPin, newPin, ...(verificationToken ? { verificationToken } : {}) },
    signal,
  });
}

/** Seconds until each can change again (0 = now), and whether `email` is used by another account. */
export type ChangeAvailability = {
  pin: { retryAfter: number };
  email: { retryAfter: number };
  emailTaken?: boolean;
};

/** Checks the PIN, then says whether the MPIN / email can change now (24-hour cooldown after each change). */
export function getChangeAvailability(
  phone: string,
  pin: string,
  email?: string,
  signal?: AbortSignal,
): Promise<ChangeAvailability> {
  return apiRequest('POST', '/auth/change/availability', {
    body: { phoneNumber: phone, pin, ...(email ? { email } : {}) },
    signal,
  });
}

/** The server refused because the field changed less than 24 hours ago. */
export function isChangeCooldown(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 429 && error.data?.code === 'CHANGE_COOLDOWN';
}

/** The server wants a (new) SMS code before this change, e.g. the last one is older than 30 minutes. */
export function needsSmsCode(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401 && error.data?.code === 'OTP_REQUIRED';
}
