import { STELLAR_NETWORK_PASSPHRASE } from '../../config/env';
import { ApiError, UserFacingError } from '../api/client';
import { confirmOfflineKey, prepareOfflineKey, registerRecipient } from '../api/engine';
import { getSessionToken } from '../session';
import { submitAndWait } from '../stellar/sorobanRpc';
import { openWalletSigner } from '../wallet/signer';
import { getOfflineSetup, saveOfflineSetup, type OfflineSetup } from './offlineConfig';

/**
 * Gets this phone ready to pay offline. It needs the network, so it runs while the phone is online:
 *  1. sign in to the backend with the wallet key (SEP-10);
 *  2. make sure the chain holds this phone's offline device key, since the contract checks every voucher against it
 *     (a new phone, or a restored account, has a new key; the wallet signs the on-chain change);
 *  3. register the account's short ID on-chain, so a voucher can pay it, and take the backend's gateway, token and
 *     contract IDs, which the voucher signature covers.
 * The result is cached; it is repeated only when the wallet or the device key changes.
 */
let inFlight: Promise<OfflineSetup> | null = null;

/** Development builds name each step as it starts, so a failure in the Metro log says which request it was. */
let startedAt = 0;
function trace(step: string): void {
  if (!__DEV__) return;
  if (step.startsWith('SEP-10')) startedAt = Date.now();
  console.log(`[offline-setup] +${Date.now() - startedAt}ms ${step}`);
}

export function ensureOfflineReady(walletPublicKey: string, signal?: AbortSignal): Promise<OfflineSetup> {
  inFlight ??= run(walletPublicKey, signal).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(walletPublicKey: string, signal?: AbortSignal): Promise<OfflineSetup> {
  if (!STELLAR_NETWORK_PASSPHRASE) {
    throw new UserFacingError('The Stellar network passphrase is missing. Add EXPO_PUBLIC_STELLAR_NETWORK_PASSPHRASE to .env.');
  }
  const signer = await openWalletSigner(walletPublicKey);
  const deviceKey = signer.offlineDeviceAddress;
  if (!deviceKey) {
    throw new UserFacingError('This phone has no offline payment key. Sign in again with your recovery phrase.');
  }

  const cached = await getOfflineSetup(walletPublicKey, deviceKey);
  if (cached) return cached;

  trace('SEP-10 sign-in (GET/POST /auth)');
  const token = await getSessionToken(signer, signal);

  trace('offline key check (POST /engine/offline-key)');
  const key = await prepareOfflineKey(deviceKey, token, signal);
  if (key.status === 'rotation_required') {
    trace('offline key changed: submitting rotation, then PATCH /engine/offline-key');
    await submitAndWait(signer.signPreparedTransaction(key.xdr, STELLAR_NETWORK_PASSPHRASE));
    await confirmOfflineKey(deviceKey, token, signal);
  }

  trace('register short ID (POST /engine/recipient-registry)');
  const { offlineConfig } = await registerWithRetry(token, signal);
  const setup: OfflineSetup = { walletPublicKey, deviceKey, config: offlineConfig };
  await saveOfflineSetup(setup);
  trace('done');
  return setup;
}

const REGISTER_ATTEMPTS = 3;
const REGISTER_RETRY_MS = 4_000;

/**
 * Registration waits for the ledger to confirm, which can outlast the server's time limit: it answers 502/503/504
 * (or the request times out) although the transaction goes through. Repeating it is safe: a short ID that is
 * already registered answers `already_registered` straight away.
 */
async function registerWithRetry(token: string, signal?: AbortSignal) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await registerRecipient(token, signal);
    } catch (error) {
      const slow = error instanceof ApiError && (error.kind === 'timeout' || [502, 503, 504].includes(error.status));
      if (!slow || attempt >= REGISTER_ATTEMPTS || signal?.aborted) throw error;
      trace(`registration is slow (${error instanceof ApiError ? error.status || error.kind : 'error'}), checking again`);
      await new Promise((resolve) => setTimeout(resolve, REGISTER_RETRY_MS));
    }
  }
}
