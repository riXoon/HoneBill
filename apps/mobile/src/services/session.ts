import { Buffer } from 'buffer';

import { exchangeAuthChallenge, getAuthChallenge } from './api/auth';
import type { WalletSigner } from './wallet/signer';

/**
 * The SEP-10 session: a JWT proving this phone holds the wallet key, which the `Sep10JwtGuard` routes need
 * (`/engine/offline-key`, `/engine/recipient-registry`). It lives in memory only, for one wallet, and is
 * dropped on sign-out; signing in again costs one challenge round trip with a signer the caller already has.
 */

/** Ask for a new token this long before the old one expires, so a request never races the expiry. */
const EXPIRY_MARGIN_MS = 60_000;

let current: { publicKey: string; token: string; expiresAt: number } | null = null;

function expiryOf(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** A valid session token for the signer's wallet, signing a fresh challenge when there is none. */
export async function getSessionToken(signer: WalletSigner, signal?: AbortSignal): Promise<string> {
  if (current && current.publicKey === signer.publicKey && current.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return current.token;
  }
  const challenge = await getAuthChallenge(signer.publicKey, signal);
  const signed = signer.signChallenge(challenge.transaction, challenge.network_passphrase);
  const { token } = await exchangeAuthChallenge(signed, signal);
  current = { publicKey: signer.publicKey, token, expiresAt: expiryOf(token) };
  return token;
}

export function clearSession(): void {
  current = null;
}
