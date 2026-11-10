import { Buffer } from 'buffer';

import { SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE } from '../../config/env';
import { UserFacingError } from '../api/client';
import { loadStellar } from '../wallet/signer';

/**
 * The two Soroban RPC calls the app makes itself: submit a signed transaction, then wait for the ledger's answer.
 * Plain JSON-RPC over fetch, so the SDK's RPC client (and its URL/EventSource polyfills) stays out of the bundle.
 */

const REQUEST_TIMEOUT_MS = 15_000;
/** A ledger closes every ~5 s, so a tighter poll only trims the wait between the close and the app noticing it. */
const POLL_INTERVAL_MS = 1_000;
/** Soroban transactions close in ~5 s; past this the result is unknown, not failed. */
const CONFIRM_TIMEOUT_MS = 45_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  if (!SOROBAN_RPC_URL) throw new UserFacingError('The Stellar network address is not set. Add EXPO_PUBLIC_SOROBAN_RPC_URL to .env.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(SOROBAN_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal,
      });
    } catch {
      throw new UserFacingError('Cannot reach the Stellar network. Check your connection and try again.');
    }
    const json = (await response.json().catch(() => null)) as { result?: T; error?: { message?: string } } | null;
    if (!response.ok || !json || json.error || json.result === undefined) {
      throw new UserFacingError('The Stellar network did not accept the request. Please try again.');
    }
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

type SendResult = {
  status: 'PENDING' | 'DUPLICATE' | 'TRY_AGAIN_LATER' | 'ERROR';
  hash: string;
  /** Base64 `TransactionResult` when the network refuses the transaction outright. */
  errorResultXdr?: string;
};
type GetResult = { status: 'SUCCESS' | 'FAILED' | 'NOT_FOUND' };

/** Thrown when the transaction was submitted but its outcome is not known yet. Money may still move. */
export class PendingTransactionError extends UserFacingError {
  constructor(readonly hash: string) {
    super('The network is taking longer than usual. Check your history in a minute before trying again.');
    this.name = 'PendingTransactionError';
  }
}

/** Submits a signed envelope and resolves with its hash once the ledger has applied it. */
export async function submitAndWait(signedXdr: string): Promise<string> {
  if (__DEV__) await logOutgoing(signedXdr);
  const sent = await rpc<SendResult>('sendTransaction', { transaction: signedXdr });
  if (sent.status === 'ERROR') {
    const code = await resultCodeOf(sent.errorResultXdr);
    if (__DEV__) console.log('[soroban] sendTransaction ERROR', JSON.stringify({ hash: sent.hash, resultCode: code, errorResultXdr: sent.errorResultXdr }));
    // The wallet pays every network fee in XLM and must keep a minimum balance; a wallet funded with no spare XLM
    // fails here whatever the transaction is.
    if (code === 'txInsufficientBalance') {
      throw new UserFacingError(
        'Your wallet has no spare XLM to pay the network fee. Ask support to top up your wallet. No money has been moved.',
      );
    }
    throw new UserFacingError(
      `The network rejected the transaction${code ? ` (${code})` : ''}. No money has been moved.`,
    );
  }
  if (sent.status === 'TRY_AGAIN_LATER') throw new UserFacingError('The network is busy. No money has been moved; try again shortly.');

  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let result: GetResult;
    try {
      result = await rpc<GetResult>('getTransaction', { hash: sent.hash });
    } catch {
      continue; // A dropped poll says nothing about the transaction; keep asking until the deadline.
    }
    if (result.status === 'SUCCESS') return sent.hash;
    if (result.status === 'FAILED') throw new UserFacingError('The transaction failed on the network. No money has been moved.');
  }
  throw new PendingTransactionError(sent.hash);
}

/** The Stellar result code ("txBadAuth", "txInsufficientFee", ...) inside a refused transaction's result. */
async function resultCodeOf(errorResultXdr: string | undefined): Promise<string | null> {
  if (!errorResultXdr) return null;
  try {
    const { xdr } = await loadStellar();
    return xdr.TransactionResult.fromXDR(errorResultXdr, 'base64').result().switch().name;
  } catch {
    return null;
  }
}

/** Development only: what is about to be sent. All public; the signature itself is not printed. */
async function logOutgoing(signedXdr: string): Promise<void> {
  try {
    const { TransactionBuilder, Transaction } = await loadStellar();
    const tx = TransactionBuilder.fromXDR(signedXdr, STELLAR_NETWORK_PASSPHRASE);
    if (!(tx instanceof Transaction)) return;
    console.log(
      '[soroban] submitting',
      JSON.stringify({
        networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
        source: tx.source,
        sequence: tx.sequence,
        feeStroops: tx.fee,
        operations: tx.operations.map((op) => op.type),
        signatures: tx.signatures.length,
        timeBounds: tx.timeBounds ?? null,
        hash: Buffer.from(tx.hash()).toString('hex'),
      }),
    );
  } catch (error) {
    console.log('[soroban] could not read the outgoing transaction', error instanceof Error ? error.message : error);
  }
}
