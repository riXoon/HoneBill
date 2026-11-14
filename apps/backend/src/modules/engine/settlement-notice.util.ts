import { normalizeSettlementUserFailure } from './engine-retry.util.js';

/**
 * The texts an offline payment produces, and the plain-language reason a failed one shows. An offline sender can only
 * hear back by SMS, so every text names the amount, the other party and a short reference the app shows on its receipt.
 * Plain ASCII on purpose: a "₱" would force the whole text into UCS-2 and halve what fits in one SMS.
 */

/** What a text needs to describe one voucher. */
export type VoucherNotice = {
  nonce: string;
  senderShortId: string;
  receiverShortId: string;
  amountStroops: bigint;
  symbol: string;
  decimals: number;
  /** Where to text the receiver, when their account has a number. */
  receiverPhone: string | null;
  /** The sender's first name, so the receiver recognises who paid. `null` when the account has none. */
  senderName: string | null;
};

const NAME_MAX = 20;

/**
 * A name made safe for a GSM text: printable ASCII only (one accented or emoji character would switch the whole SMS
 * to UCS-2 and halve its length), spaces collapsed, at most 20 characters. `null` when nothing usable is left.
 */
export function smsSafeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Short reference for a voucher, built from its nonce: the first six letters and digits, upper-cased. The app builds
 * the same one from the same nonce (`voucherRef` in apps/mobile/src/utils/format.ts), so a text and a receipt match.
 */
export function voucherRef(nonceBase64: string): string {
  return nonceBase64.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
}

/** "PHP 1,250.50": PHPC reads as pesos; cents are truncated, never rounded up. */
export function formatVoucherAmount(stroops: bigint, symbol: string, decimals = 7): string {
  const scale = 10n ** BigInt(decimals);
  const whole = stroops / scale;
  const cents = decimals >= 2 ? (stroops % scale) / 10n ** BigInt(decimals - 2) : 0n;
  const label = symbol === 'PHPC' ? 'PHP' : symbol;
  return `${label} ${whole.toLocaleString('en-US')}.${cents.toString().padStart(2, '0')}`;
}

const GENERIC_FAILURE = 'The network did not accept this payment.';

/** Overrides for reasons whose technical wording means little to the person who paid. */
const FRIENDLIER: Record<string, string> = {
  'Recipient was not found.': 'No account has this ID.',
  'Offline device key is not enrolled.': 'This phone is not set up for offline payments yet. Open the app once with internet.',
  'Invalid voucher signature.': 'The payment could not be verified. Open the app once with internet, then try again.',
  'Sender account is not registered.': 'Your account was not found.',
};

/** A failure (an error, or a stored `failReason`) as one short sentence for the sender. Never leaks internals. */
export function userFailureReason(failure: unknown): string {
  if (failure === null || failure === undefined || failure === '') return GENERIC_FAILURE;
  const error = failure instanceof Error ? failure : new Error(String(failure));
  const reason = normalizeSettlementUserFailure(error);
  if (reason) return FRIENDLIER[reason] ?? reason;
  if (/token is inactive|token not found/i.test(error.message)) return 'This currency is not accepted right now.';
  return GENERIC_FAILURE;
}

export function settledText(notice: VoucherNotice): string {
  const amount = formatVoucherAmount(notice.amountStroops, notice.symbol, notice.decimals);
  return `HoneBill: Your offline payment of ${amount} to ID ${notice.receiverShortId} went through. Ref: ${voucherRef(notice.nonce)}`;
}

export function failedText(notice: VoucherNotice, reason: string): string {
  const amount = formatVoucherAmount(notice.amountStroops, notice.symbol, notice.decimals);
  return `HoneBill: Your offline payment of ${amount} to ID ${notice.receiverShortId} did not go through. ${reason} No money was taken. Ref: ${voucherRef(notice.nonce)}`;
}

export function receivedText(notice: VoucherNotice): string {
  const amount = formatVoucherAmount(notice.amountStroops, notice.symbol, notice.decimals);
  const name = smsSafeName(notice.senderName);
  const from = name ? `${name} (ID ${notice.senderShortId})` : `ID ${notice.senderShortId}`;
  return `HoneBill: You received ${amount} from ${from}. Ref: ${voucherRef(notice.nonce)}`;
}
