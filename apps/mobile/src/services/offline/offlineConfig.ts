import * as SecureStore from 'expo-secure-store';

import type { OfflineConfig } from '../api/engine';

/**
 * What the phone learned while online that offline payments need: the backend's gateway, token and contract (the
 * voucher signature covers them), and which offline device key the chain holds for this wallet. None of it is
 * secret, but a wrong value only shows up as a rejected voucher, so it is stored for one wallet and one device key
 * and ignored for any other.
 */
export type OfflineSetup = {
  /** The wallet address it was prepared for. */
  walletPublicKey: string;
  /** The offline device key ("G...") confirmed on-chain for that wallet. */
  deviceKey: string;
  config: OfflineConfig;
};

const KEY = 'honebill.offline.setup';
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

function isSetup(value: unknown): value is OfflineSetup {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const c = v.config as Record<string, unknown> | undefined;
  return (
    typeof v.walletPublicKey === 'string' &&
    typeof v.deviceKey === 'string' &&
    !!c &&
    typeof c.contractId === 'string' &&
    typeof c.gatewayPublicKey === 'string' &&
    typeof c.tokenContractId === 'string' &&
    typeof c.tokenDbId === 'string' &&
    typeof c.tokenSymbol === 'string'
  );
}

export async function getOfflineSetup(walletPublicKey: string, deviceKey?: string): Promise<OfflineSetup | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSetup(parsed) || parsed.walletPublicKey !== walletPublicKey) return null;
    return deviceKey && parsed.deviceKey !== deviceKey ? null : parsed;
  } catch {
    return null;
  }
}

export async function saveOfflineSetup(setup: OfflineSetup): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(setup), OPTIONS);
  } catch {
    // Without it the setup simply runs again next time the phone is online.
  }
}

export async function clearOfflineSetup(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY, OPTIONS);
  } catch {
    // Nothing to clear.
  }
}
