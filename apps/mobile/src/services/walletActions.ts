import { HORIZON_URL, PHPC_ISSUER, STELLAR_NETWORK_PASSPHRASE, TOKEN_CONTRACT_ID } from '../config/env';
import { settleDeposit, startDeposit } from './api/anchor';
import { ApiError, UserFacingError } from './api/client';
import { prepareDeposit, prepareTransfer, prepareWithdraw } from './api/engine';
import { confirmTransfer } from './api/wallet';
import { reportError } from './errorReporting';
import { getSessionToken } from './session';
import { loadAccount, submitTransaction, type HorizonAccount } from './stellar/horizon';
import { submitAndWait } from './stellar/sorobanRpc';
import { openWalletSigner, type WalletSigner } from './wallet/signer';

/**
 * Money movements that go through the ledger. Each one: sign the intent, let the backend prepare the
 * transaction, sign it, submit it, and wait for the result. Resolves with the transaction hash.
 */

/** PHPC has 7 decimals. Amounts on screen have at most 2, so whole cents avoid float error. */
export function pesosToStroops(pesos: number): string {
  const cents = Math.round(pesos * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new UserFacingError('Enter a valid amount.');
  return (BigInt(cents) * 100_000n).toString();
}

function requireConfig(): void {
  if (!STELLAR_NETWORK_PASSPHRASE || !TOKEN_CONTRACT_ID) {
    throw new UserFacingError('The Stellar settings are missing. Add the network passphrase and token ID to .env.');
  }
}

/** Online wallet -> offline vault (`/engine/deposit`). */
export async function moveToOffline(walletPublicKey: string, pesos: number): Promise<string> {
  requireConfig();
  const amountStroops = pesosToStroops(pesos);
  const signer = await openWalletSigner(walletPublicKey);
  if (!signer.offlineDevicePubkeyHex) {
    throw new UserFacingError("This phone has no offline payment key. Sign in again with your recovery phrase.");
  }
  const { xdr } = await prepareDeposit(
    {
      senderPublicKey: signer.publicKey,
      tokenAddress: TOKEN_CONTRACT_ID,
      offlineDevicePubkeyHex: signer.offlineDevicePubkeyHex,
      amountStroops,
    },
    signer.signMessage(`deposit:${signer.publicKey}:${amountStroops}`),
  );
  return submitAndWait(signer.signPreparedTransaction(xdr, STELLAR_NETWORK_PASSPHRASE));
}

/** Offline vault -> online wallet (`/engine/withdraw`). */
export async function moveToOnline(walletPublicKey: string, pesos: number): Promise<string> {
  requireConfig();
  const amountStroops = pesosToStroops(pesos);
  const signer = await openWalletSigner(walletPublicKey);
  const { xdr } = await prepareWithdraw(
    { senderPublicKey: signer.publicKey, tokenAddress: TOKEN_CONTRACT_ID, amountStroops },
    signer.signMessage(`withdraw:${signer.publicKey}:${amountStroops}`),
  );
  return submitAndWait(signer.signPreparedTransaction(xdr, STELLAR_NETWORK_PASSPHRASE));
}

const CONFIRM_ATTEMPTS = 4;
const CONFIRM_DELAY_MS = 2_000;

/** Online wallet -> someone else's online wallet (`/engine/transfer`), then marks it settled on the backend. */
export async function sendOnline(walletPublicKey: string, recipientPublicKey: string, pesos: number): Promise<string> {
  requireConfig();
  const amountStroops = pesosToStroops(pesos);
  const signer = await openWalletSigner(walletPublicKey);
  const { xdr } = await prepareTransfer(
    { senderPublicKey: signer.publicKey, recipientPublicKey, tokenAddress: TOKEN_CONTRACT_ID, amountStroops },
    signer.signMessage(
      `transfer:v2:online:${TOKEN_CONTRACT_ID}:${signer.publicKey}:${recipientPublicKey}:${amountStroops}`,
    ),
  );
  const hash = await submitAndWait(signer.signPreparedTransaction(xdr, STELLAR_NETWORK_PASSPHRASE));

  // The money has moved; confirming only updates the backend's record, so a failure here is reported, not thrown.
  for (let attempt = 1; attempt <= CONFIRM_ATTEMPTS; attempt += 1) {
    try {
      await confirmTransfer(hash);
      break;
    } catch (error) {
      const retryable = error instanceof ApiError && (error.status === 409 || error.kind !== 'http');
      if (!retryable || attempt === CONFIRM_ATTEMPTS) {
        reportError(error, { step: 'confirmTransfer', hash });
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, CONFIRM_DELAY_MS));
    }
  }
  return hash;
}

const PHPC = 'PHPC';

/** The one-time interactive token inside the deposit URL (`...?transaction_id=...&token=...`). */
export function tokenFromUrl(url: string): string | null {
  const match = /[?&]token=([^&#]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Makes sure the wallet can hold PHPC. Returns whether a trustline had to be created. */
async function ensurePhpcTrustline(signer: WalletSigner, account: HorizonAccount | null): Promise<boolean> {
  if (!account) throw new UserFacingError('Your wallet is not on the Stellar network yet. Ask support to set it up.');
  if (account.balances.some((b) => b.asset_code === PHPC && b.asset_issuer === PHPC_ISSUER)) return false;
  await submitTransaction(signer.signTrustline(account.sequence, PHPC, PHPC_ISSUER, STELLAR_NETWORK_PASSPHRASE));
  return true;
}

/** What a top-up is doing now, for the screen to show while the several-second run goes on. */
export type TopUpStep = 'preparing' | 'wallet' | 'requesting' | 'paying';

/**
 * Top-up (testnet): sets up the PHPC trustline if the wallet has none, opens a deposit with the anchor, and has
 * the anchor pay the amount from its distributor. Resolves with the payment's transaction hash. Development builds
 * log how long each step took, so a slow top-up can be traced to the step.
 */
export async function topUp(walletPublicKey: string, pesos: number, onStep: (step: TopUpStep) => void = () => {}): Promise<string> {
  if (!(pesos > 0)) throw new UserFacingError('Enter a valid amount.');
  if (!HORIZON_URL || !PHPC_ISSUER || !STELLAR_NETWORK_PASSPHRASE) {
    throw new UserFacingError('The Stellar settings are missing. Add the Horizon URL, PHPC issuer and network passphrase to .env.');
  }
  const started = Date.now();
  const lap = (name: string) => {
    if (__DEV__) console.log(`[top-up] +${Date.now() - started}ms ${name}`);
  };

  onStep('preparing');
  // The account read is a network wait and the key derivation is CPU work, so they run side by side.
  const [signer, account] = await Promise.all([openWalletSigner(walletPublicKey), loadAccount(walletPublicKey)]);
  lap('wallet key ready, account read');

  onStep('wallet');
  const created = await ensurePhpcTrustline(signer, account);
  lap(created ? 'PHPC trustline created' : 'PHPC trustline already there');

  onStep('requesting');
  const session = await getSessionToken(signer);
  lap('session ready');
  const deposit = await startDeposit(session);
  lap('deposit opened');
  const token = tokenFromUrl(deposit.url);
  if (!deposit.id || !token) throw new UserFacingError('The top-up service sent an unexpected answer. Please try again.');

  onStep('paying');
  const result = await settleDeposit({ transaction_id: deposit.id, amount: pesos.toFixed(2), token });
  lap('anchor paid');
  return result.stellar_tx_hash;
}
