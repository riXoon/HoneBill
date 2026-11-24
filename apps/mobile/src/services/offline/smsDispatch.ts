import { AppState } from 'react-native';
import Storage from 'expo-sqlite/kv-store';

import type { SendDraft } from '../../navigation/types';
import type { Recipient } from '../../types/recipient';
import type { PendingOffline } from '../walletCache';

/** Payment reference saved before opening Messages for tracking after an auto-lock or restart. */
export type SmsHandoff = {
  publicKey: string;
  feeCents?: number;
  assetCode?: string;
  nonce: string;
  draft: SendDraft;
  /** As it was when the text was opened, so History can name them after a restart. */
  recipient: Recipient | null;
  /** Unix ms the messaging app was opened. */
  openedAt: number;
};

const key = (publicKey: string) => `honebill.smsDispatch.${publicKey}`;

// Start tracking after the person leaves for Messages, or after a restart. Saving alone does not mean Messages opened.
let leftSinceSave = true;
AppState.addEventListener('change', (state) => {
  if (state === 'background') leftSinceSave = true;
});

// Ignore handoffs that were handled in this session, even while their stored copy is being removed.
const handled = new Set<string>();

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Calls `listener` when the saved handoff changes. Returns the unsubscribe. */
export function onDispatchChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function saveSmsHandoff(dispatch: SmsHandoff): Promise<void> {
  leftSinceSave = false;
  handled.delete(dispatch.nonce);
  await Storage.setItem(key(dispatch.publicKey), JSON.stringify(dispatch));
  notify();
}

export async function loadSmsHandoff(publicKey: string): Promise<SmsHandoff | null> {
  if (!leftSinceSave) return null;
  try {
    const raw = await Storage.getItem(key(publicKey));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SmsHandoff>;
    if (
      (typeof value.nonce === 'string' && handled.has(value.nonce)) ||
      value.publicKey !== publicKey ||
      typeof value.nonce !== 'string' ||
      typeof value.openedAt !== 'number' ||
      !value.draft ||
      typeof value.draft.amount !== 'number'
    ) {
      return null;
    }
    return value as SmsHandoff;
  } catch {
    return null;
  }
}

/** Removes a tracked handoff, or one for which Messages failed to open. */
export async function clearSmsHandoff(publicKey: string, nonce: string): Promise<void> {
  handled.add(nonce);
  try {
    const raw = await Storage.getItem(key(publicKey));
    if (raw && (JSON.parse(raw) as Partial<SmsHandoff>).nonce !== nonce) return;
    await Storage.removeItem(key(publicKey));
  } catch {
    // A later restart can track it again. Holds and review records are keyed by nonce.
  }
  notify();
}

/** The voucher's fifth field is its nonce, unique to this payment, so it also serves as the reference. */
export function voucherNonce(voucher: string): string {
  return voucher.split(':')[4] ?? voucher;
}

/** The pending History entry for a dispatched offline payment. */
export function pendingPayment(
  nonce: string,
  amount: number,
  recipient: Recipient | null,
  issuedAt: number,
  feeCents?: number,
  assetCode = 'PHPC',
): PendingOffline {
  return {
    id: `pending:${nonce}`,
    timestamp: issuedAt,
    source: 'offline',
    direction: 'out',
    amount,
    assetCode,
    feeCents,
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
