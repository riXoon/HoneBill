import * as SecureStore from 'expo-secure-store';

const KEY = 'honebill.accountPhone';

/** The number this phone signs in with (E.164). SecureStore can throw (locked keystore), so failures read as "none". */
export async function getAccountPhone(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function setAccountPhone(phone: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, phone);
  } catch {
    // The user can re-enter the number next time.
  }
}

export async function clearAccountPhone(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** "+639123456789" -> "+63 912 345 6789" (falls back to the raw value for other formats). */
export function formatPhoneDisplay(phone: string): string {
  const match = /^\+63(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return match ? `+63 ${match[1]} ${match[2]} ${match[3]}` : phone;
}
