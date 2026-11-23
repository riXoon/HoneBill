import { apiRequest } from './client';

/**
 * These routes read the contract and simulate a transaction over Soroban RPC (and register a recipient on-chain),
 * which on a cold server takes well over the default 15 s. A client that gives up early leaves the user unable to
 * tell whether it worked, so they get a longer wait; every one of them is safe to repeat.
 */
const ENGINE_TIMEOUT_MS = 60_000;

/**
 * The backend builds and simulates each Soroban transaction; the app signs it and submits it. Each call is
 * authorised by `signature`: the wallet key's base64 signature over the intent string in the comment, which the
 * server rebuilds from the body and checks before doing any work.
 */
type Prepared = { xdr: string; txHash: string };

/** Online wallet -> offline vault. Signed intent: `deposit:<sender>:<amountStroops>`. */
export function prepareDeposit(
  body: { senderPublicKey: string; tokenAddress: string; offlineDevicePubkeyHex: string; amountStroops: string },
  signature: string,
  signal?: AbortSignal,
): Promise<Prepared> {
  return apiRequest('POST', '/engine/deposit', { body, bearer: signature, signal, timeoutMs: ENGINE_TIMEOUT_MS });
}

/** Offline vault -> online wallet. Signed intent: `withdraw:<sender>:<amountStroops>`. */
export function prepareWithdraw(
  body: { senderPublicKey: string; tokenAddress: string; amountStroops: string },
  signature: string,
  signal?: AbortSignal,
): Promise<Prepared> {
  return apiRequest('POST', '/engine/withdraw', { body, bearer: signature, signal, timeoutMs: ENGINE_TIMEOUT_MS });
}

/** Online wallet -> another person's online wallet. Signed intent: `transfer:v2:online:<token>:<sender>:<recipient>:<amountStroops>`. */
export function prepareTransfer(
  body: { senderPublicKey: string; recipientPublicKey: string; tokenAddress: string; amountStroops: string },
  signature: string,
  signal?: AbortSignal,
): Promise<Prepared> {
  return apiRequest('POST', '/engine/transfer', {
    body: { ...body, paymentMode: 'online', clientProtocol: 2 },
    bearer: signature,
    signal,
    timeoutMs: ENGINE_TIMEOUT_MS,
  });
}

/** What a phone needs, and cannot ask for while offline, to build a voucher the backend and contract will accept. */
export type OfflineConfig = {
  version: number;
  contractId: string;
  gatewayPublicKey: string;
  tokenContractId: string;
  /** The `tokenId` in the voucher's first field. */
  tokenDbId: string;
  tokenSymbol: string;
  networkPassphrase: string;
};

/** Sets or checks the offline device key on-chain. `rotation_required` carries a transaction for the wallet to sign. */
export function prepareOfflineKey(
  offlineDeviceKey: string,
  token: string,
  signal?: AbortSignal,
): Promise<{ status: 'synced' } | { status: 'rotation_required'; xdr: string }> {
  return apiRequest('POST', '/engine/offline-key', { body: { offlineDeviceKey }, bearer: token, signal, timeoutMs: ENGINE_TIMEOUT_MS });
}

/** Run after the rotation transaction lands; 409 means the chain does not hold this key yet. */
export function confirmOfflineKey(offlineDeviceKey: string, token: string, signal?: AbortSignal): Promise<{ status: 'synced' }> {
  return apiRequest('PATCH', '/engine/offline-key', { body: { offlineDeviceKey }, bearer: token, signal, timeoutMs: ENGINE_TIMEOUT_MS });
}

/** Registers the account's short ID on-chain, so others' vouchers can pay it, and returns the offline config. */
export function registerRecipient(
  token: string,
  signal?: AbortSignal,
): Promise<{ status: string; txHash?: string; offlineConfig: OfflineConfig }> {
  return apiRequest('POST', '/engine/recipient-registry', { bearer: token, signal, timeoutMs: ENGINE_TIMEOUT_MS });
}
