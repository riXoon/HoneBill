import { ApiError, apiRequest } from './client';

export type UserCheck = { exists: false } | { exists: true; shortId: string; stellarPublicKey: string };

export type UserLookup = {
  shortId: string;
  stellarPublicKey: string;
  offlineDeviceKey: string | null;
  displayName: string;
  firstName: string;
  lastName: string;
};

/** Whether an account is registered for this phone. */
export function checkUser(phone: string, signal?: AbortSignal): Promise<UserCheck> {
  return apiRequest('GET', '/users/check', { query: { phone }, signal });
}

async function lookup(query: { shortId?: string; phone?: string }, signal?: AbortSignal): Promise<UserLookup | null> {
  try {
    return await apiRequest<UserLookup>('GET', '/users/lookup', { query, signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** The short ID is case-sensitive. Resolves to `null` when no account has it. */
export function lookupUserByShortId(shortId: string, signal?: AbortSignal): Promise<UserLookup | null> {
  return lookup({ shortId }, signal);
}

export function lookupUserByPhone(phone: string, signal?: AbortSignal): Promise<UserLookup | null> {
  return lookup({ phone }, signal);
}

export type ProfileChanges = { firstName?: string; lastName?: string; email?: string };

/** Edits the account's name and/or email. The PIN proves the caller owns the account. */
export function updateProfile(phone: string, pin: string, changes: ProfileChanges, signal?: AbortSignal): Promise<{ success: true }> {
  return apiRequest('PATCH', '/users/profile', { body: { phoneNumber: phone, pin, ...changes }, signal });
}
