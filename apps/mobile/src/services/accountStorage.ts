import * as SecureStore from 'expo-secure-store';

import type { AccountProfile } from '../context/AuthContext';

/**
 * The signed-in account's public profile (names, phone, short ID, wallet address), kept so a fingerprint
 * can reopen the app without retyping the MPIN. No secret is in it: the keys stay in the wallet store.
 * It survives sign-out, so the fingerprint keeps working for the account last used on this phone. It is deleted when
 * the phone no longer holds that account's wallet, so a biometric unlock never opens an account it cannot sign for.
 */
const KEY = 'honebill.account';

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

function isProfile(value: unknown): value is AccountProfile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.shortId === 'string' &&
    typeof v.stellarPublicKey === 'string' &&
    typeof v.firstName === 'string' &&
    typeof v.lastName === 'string' &&
    (v.phone === null || typeof v.phone === 'string')
  );
}

export async function getStoredAccount(): Promise<AccountProfile | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveStoredAccount(profile: AccountProfile): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(profile), OPTIONS);
  } catch {
    // Without it the fingerprint button is simply not offered; the MPIN still works.
  }
}

export async function clearStoredAccount(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY, OPTIONS);
  } catch {
    // Nothing to clear.
  }
}
