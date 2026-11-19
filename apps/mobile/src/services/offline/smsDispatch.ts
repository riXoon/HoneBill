import { AppState } from 'react-native';
import Storage from 'expo-sqlite/kv-store';

import type { SendDraft } from '../../navigation/types';
import type { Recipient } from '../../types/recipient';
import type { PendingOffline } from '../walletCache';

/**
 * An offline payment whose text was opened in the messaging app but whose "Did you send the text?" question has not
 * been answered yet.
 *
 * The messaging app cannot tell HoneBill whether the text went out, so the person is asked when they come back. While
 * they are away, HoneBill can lock itself (30 s, which sends them to the MPIN screen and closes the Send screens) or
 * be closed by the phone. The question used to live only on the Send screen, so in those cases it was never asked: the
 * text could settle with the money never held on this phone, and "available to spend" showed too much (QA OFF-06).
 *
 * So the question is saved here, on the phone, before the messaging app opens, and `SmsDispatchPrompt` asks it the
 * next time this wallet is signed in and in the app, however long that takes. One per wallet: a new text replaces it.
 * The voucher is already queued in the same database when the answer is yes, so keeping it here exposes nothing new.
 */
export type UnansweredDispatch = {
  publicKey: string;
  /** The signed voucher, exactly as texted. */
  voucher: string;
  nonce: string;
  draft: SendDraft;
  /** As it was when the text was opened, so the receipt and History can name them after a restart. */
  recipient: Recipient | null;
  /** Unix ms the messaging app was opened: the payment's time once confirmed. */
  openedAt: number;
};

const key = (publicKey: string) => `honebill.smsDispatch.${publicKey}`;

// Asked only once the person has actually left for the messaging app, never while they are still on the Send screen
// (e.g. a sign-in or navigation event between saving and the messaging app opening). After a restart it is true.
let leftSinceSave = true;
AppState.addEventListener('change', (state) => {
  if (state === 'background') leftSinceSave = true;
});

// Answered in this session. Skipped at once, before the stored copy is removed, so the question is never asked twice.
const answered = new Set<string>();

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Calls `listener` whenever a question is saved or answered. Returns the unsubscribe. */
export function onDispatchChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Saves the question before the messaging app opens. Throws if it cannot be saved, so the text is not sent unasked. */
export async function saveUnansweredDispatch(dispatch: UnansweredDispatch): Promise<void> {
  leftSinceSave = false;
  // The same voucher texted again (after "Not yet") is asked about again.
  answered.delete(dispatch.nonce);
  await Storage.setItem(key(dispatch.publicKey), JSON.stringify(dispatch));
  notify();
}

/** The question waiting for this wallet, if any, and only once the person has left the app since it was saved. */
export async function loadUnansweredDispatch(publicKey: string): Promise<UnansweredDispatch | null> {
  if (!leftSinceSave) return null;
  try {
    const raw = await Storage.getItem(key(publicKey));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<UnansweredDispatch>;
    if (
      (typeof value.nonce === 'string' && answered.has(value.nonce)) ||
      value.publicKey !== publicKey ||
      typeof value.voucher !== 'string' ||
      typeof value.nonce !== 'string' ||
      typeof value.openedAt !== 'number' ||
      !value.draft ||
      typeof value.draft.amount !== 'number'
    ) {
      return null;
    }
    return value as UnansweredDispatch;
  } catch {
    return null;
  }
}

/** Answered (or the messaging app never opened). Only removes the question for that payment, not a newer one. */
export async function clearUnansweredDispatch(publicKey: string, nonce: string): Promise<void> {
  answered.add(nonce);
  try {
    const raw = await Storage.getItem(key(publicKey));
    if (raw && (JSON.parse(raw) as Partial<UnansweredDispatch>).nonce !== nonce) return;
    await Storage.removeItem(key(publicKey));
  } catch {
    // Asked once more next time; a repeat "yes" is harmless (the pending list and the queue are keyed by nonce).
  }
  notify();
}

/** The voucher's fifth field is its nonce, unique to this payment, so it also serves as the reference. */
export function voucherNonce(voucher: string): string {
  return voucher.split(':')[4] ?? voucher;
}

/** The pending History entry for an offline payment the person says they sent. */
export function pendingPayment(
  nonce: string,
  amount: number,
  recipient: Recipient | null,
  issuedAt: number,
): PendingOffline {
  return {
    id: `pending:${nonce}`,
    timestamp: issuedAt,
    source: 'offline',
    direction: 'out',
    amount,
    assetCode: 'PHPC',
    description: !recipient
      ? 'Sent to recipient'
      : recipient.unverified
        ? `Sent to ID ${recipient.shortId}`
        : `Sent to ${recipient.name}`,
    status: 'pending',
    ref: nonce,
    nonce,
    ...(recipient ? { counterpartyShortId: recipient.shortId } : {}),
  };
}
