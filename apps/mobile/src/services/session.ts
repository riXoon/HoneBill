import { Buffer } from 'buffer';

import { exchangeAuthChallenge, getAuthChallenge } from './api/auth';
import { ApiError } from './api/client';
import { openWalletSigner, type WalletSigner } from './wallet/signer';

/**
 * The SEP-10 session is a JWT proving this phone holds the wallet key for guarded routes.
 * It lives in memory only, for one wallet, and is dropped when the local sign-in changes.
 */

/** Ask for a new token this long before the old one expires, so a request never races the expiry. */
const EXPIRY_MARGIN_MS = 60_000;

let current: { publicKey: string; token: string; expiresAt: number } | null = null;
type SessionRequest = {
  publicKey: string;
  controller: AbortController;
  result: Promise<string>;
  callers: number;
};
let pending: SessionRequest | null = null;

function expiryOf(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString('utf8')) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function cancelled(): ApiError {
  return new ApiError('aborted', 0, 'Request cancelled.');
}

async function signIn(wallet: WalletSigner | string, publicKey: string, signal: AbortSignal): Promise<string> {
  const signer = typeof wallet === 'string' ? await openWalletSigner(wallet) : wallet;
  if (signal.aborted) throw cancelled();
  const challenge = await getAuthChallenge(publicKey, signal);
  if (signal.aborted) throw cancelled();
  const signed = signer.signChallenge(challenge.transaction, challenge.network_passphrase);
  const { token } = await exchangeAuthChallenge(signed, signal);
  if (signal.aborted) throw cancelled();
  if (typeof token !== 'string' || !token) throw new Error('SEP-10 response did not include a token.');
  current = { publicKey, token, expiresAt: expiryOf(token) };
  return token;
}

/** Use a cached token before opening the device signer. Other actions can supply a signer they already opened. */
export async function getSessionToken(wallet: WalletSigner | string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw cancelled();
  const publicKey = typeof wallet === 'string' ? wallet : wallet.publicKey;
  if (current?.publicKey === publicKey && current.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return current.token;
  }

  if (pending?.publicKey !== publicKey || pending.controller.signal.aborted) {
    pending?.controller.abort();
    const controller = new AbortController();
    pending = { publicKey, controller, callers: 0, result: signIn(wallet, publicKey, controller.signal) };
  }

  const request = pending;
  const requestSignal = request.controller.signal;
  request.callers += 1;
  // The exchange is shared, but each caller can leave independently. The last caller cancels the exchange.
  return new Promise<string>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      requestSignal.removeEventListener('abort', onAbort);
      request.callers -= 1;
      if (request.callers === 0 && pending === request) pending = null;
    };
    const onAbort = () => {
      finish();
      if (request.callers === 0) request.controller.abort();
      reject(cancelled());
    };
    signal?.addEventListener('abort', onAbort);
    requestSignal.addEventListener('abort', onAbort);
    void request.result.then(
      (token) => {
        if (signal?.aborted || requestSignal.aborted) return;
        finish();
        resolve(token);
      },
      (error: unknown) => {
        if (signal?.aborted || requestSignal.aborted) return;
        finish();
        reject(error);
      },
    );
  });
}

/** A delayed 401 can invalidate only the token the server actually rejected. */
export function invalidateSessionToken(publicKey: string, token: string): void {
  if (current?.publicKey === publicKey && current.token === token) current = null;
}

export function clearSession(): void {
  current = null;
  pending?.controller.abort();
  pending = null;
}
