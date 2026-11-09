import * as SecureStore from 'expo-secure-store';

import { yieldToEventLoop } from '../../utils/async';
import { createDeviceKeyPair, createMnemonic, publicKeyFromMnemonic } from './stellarKeys';

/**
 * The account's two secrets live only in the OS keystore (SecureStore), never in app state, logs or the
 * backend:
 *  - the recovery phrase: the wallet key, shown once for backup;
 *  - the offline device key: a separate key that signs offline payment vouchers.
 * Public addresses are derived from them on demand.
 *
 * One wallet per device: creating a new account replaces the stored secrets. If the stored ones already
 * belong to a registered account they are kept as `previous`, so they are never destroyed silently.
 */
const KEY_MNEMONIC = 'honebill.wallet.mnemonic';
const KEY_OFFLINE = 'honebill.wallet.offlineKey';
const KEY_REGISTERED = 'honebill.wallet.registered';
const KEY_PREVIOUS = 'honebill.wallet.previousMnemonic';
const KEY_PREVIOUS_OFFLINE = 'honebill.wallet.previousOfflineKey';

/** Not backed up to the cloud or restored onto another device. */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export type NewWallet = {
  /** The wallet's "G..." address (`stellarPublicKey` at registration). */
  publicKey: string;
  /** The offline device key's "G..." address (`offlineDeviceKey` at registration). */
  offlineDeviceKey: string;
};

/**
 * Creates and stores a fresh wallet and offline device key, returning only their public addresses.
 * Unlike a plain write, it fails if the secrets cannot be saved: registering an account whose keys were
 * never stored would lock the user out of it.
 */
export async function createDeviceWallet(): Promise<NewWallet> {
  const mnemonic = createMnemonic();
  const publicKey = await publicKeyFromMnemonic(mnemonic);
  await yieldToEventLoop();
  const deviceKey = createDeviceKeyPair();

  const [existing, existingOffline, registered] = await Promise.all([
    SecureStore.getItemAsync(KEY_MNEMONIC, OPTIONS),
    SecureStore.getItemAsync(KEY_OFFLINE, OPTIONS),
    SecureStore.getItemAsync(KEY_REGISTERED, OPTIONS),
  ]);
  if (registered === '1') {
    if (existing) await SecureStore.setItemAsync(KEY_PREVIOUS, existing, OPTIONS);
    if (existingOffline) await SecureStore.setItemAsync(KEY_PREVIOUS_OFFLINE, existingOffline, OPTIONS);
  }

  await SecureStore.setItemAsync(KEY_MNEMONIC, mnemonic, OPTIONS);
  await SecureStore.setItemAsync(KEY_OFFLINE, deviceKey.privateKeyHex, OPTIONS);
  await SecureStore.deleteItemAsync(KEY_REGISTERED, OPTIONS);
  return { publicKey, offlineDeviceKey: deviceKey.publicKey };
}

/**
 * Puts an existing account's wallet on this device from its recovery phrase (the caller has already checked the
 * phrase's address matches the account). The offline device key is not derived from the phrase, so this device
 * gets a fresh one. The account is already registered, so the secrets are marked as such and a later sign-up
 * keeps them as `previous`.
 */
export async function restoreDeviceWallet(mnemonic: string): Promise<NewWallet> {
  const publicKey = await publicKeyFromMnemonic(mnemonic);
  await yieldToEventLoop();
  const deviceKey = createDeviceKeyPair();

  const [existing, existingOffline, registered] = await Promise.all([
    SecureStore.getItemAsync(KEY_MNEMONIC, OPTIONS),
    SecureStore.getItemAsync(KEY_OFFLINE, OPTIONS),
    SecureStore.getItemAsync(KEY_REGISTERED, OPTIONS),
  ]);
  if (registered === '1' && existing && existing !== mnemonic) {
    await SecureStore.setItemAsync(KEY_PREVIOUS, existing, OPTIONS);
    if (existingOffline) await SecureStore.setItemAsync(KEY_PREVIOUS_OFFLINE, existingOffline, OPTIONS);
  }

  await SecureStore.setItemAsync(KEY_MNEMONIC, mnemonic, OPTIONS);
  await SecureStore.setItemAsync(KEY_OFFLINE, deviceKey.privateKeyHex, OPTIONS);
  await SecureStore.setItemAsync(KEY_REGISTERED, '1', OPTIONS);
  return { publicKey, offlineDeviceKey: deviceKey.publicKey };
}

/** Call once the server has accepted the account, so a later sign-up knows to preserve these secrets. */
export async function markDeviceWalletRegistered(): Promise<void> {
  await SecureStore.setItemAsync(KEY_REGISTERED, '1', OPTIONS);
}

/**
 * The recovery phrase as 12 words, for the one-time backup screen only. This is the account's
 * private key in readable form: never log it, store it in state longer than the screen needs it,
 * or send it anywhere.
 */
export async function getDeviceRecoveryWords(): Promise<string[] | null> {
  const mnemonic = await SecureStore.getItemAsync(KEY_MNEMONIC, OPTIONS);
  return mnemonic ? mnemonic.trim().split(/\s+/) : null;
}

export async function getDevicePublicKey(): Promise<string | null> {
  const mnemonic = await SecureStore.getItemAsync(KEY_MNEMONIC, OPTIONS);
  return mnemonic ? publicKeyFromMnemonic(mnemonic) : null;
}
