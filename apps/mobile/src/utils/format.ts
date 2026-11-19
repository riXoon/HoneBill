import { messages } from '../i18n';

/**
 * 100000 -> { whole: "100,000", cents: "00" }; 10.499 -> { whole: "10", cents: "49" }.
 *
 * Always to the centavo, and anything below a centavo is cut off, never rounded up: balances come from the ledger
 * with 7 decimals, and rounding up would show more than can be spent (the backend's texts cut off the same way). The
 * tiny nudge only absorbs float error, so 10.29 stored as 10.28999999 still reads 10.29.
 */
export function splitPesos(amount: number): { whole: string; cents: string } {
  const negative = amount < 0;
  const centavos = Math.floor(Math.abs(amount) * 100 + 1e-6);
  const whole = Math.floor(centavos / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return { whole: `${negative && centavos > 0 ? '-' : ''}${whole}`, cents: String(centavos % 100).padStart(2, '0') };
}

/** 1000 -> "₱1,000.00" */
export function formatPeso(amount: number): string {
  const { whole, cents } = splitPesos(amount);
  return `₱${whole}.${cents}`;
}

/** 1000.5 -> "1,000.50": pesos without the sign, for texts that already say "PHP". */
export function formatPesoPlain(amount: number): string {
  const { whole, cents } = splitPesos(amount);
  return `${whole}.${cents}`;
}

/** Pesos for PHPC, otherwise the amount with its asset code (e.g. "12.50 USDC"). */
export function formatAmount(amount: number, assetCode: string): string {
  if (assetCode === 'PHPC' || assetCode === 'PHP') return formatPeso(amount);
  const { whole, cents } = splitPesos(amount);
  return `${whole}.${cents} ${assetCode}`;
}

/** A long reference such as a 64-character transaction hash as "1a2b3c4d…9e8f7a6b"; short ones are left alone. */
export function shortRef(ref: string): string {
  return ref.length > 20 ? `${ref.slice(0, 8)}…${ref.slice(-8)}` : ref;
}

/**
 * The short reference of an offline voucher: the first six letters and digits of its nonce, upper-cased. The backend
 * builds the same one for its texts (`voucherRef` in apps/backend/src/modules/engine/settlement-notice.util.ts), so
 * "Ref: 7F3KQ2" in a text matches the receipt and History.
 */
export function voucherRef(nonce: string): string {
  return nonce.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
}

/** 82800 -> "23 hours", 3600 -> "1 hour", 90 -> "2 minutes": a wait, rounded up (matches the backend's wording). */
export function formatWait(seconds: number): string {
  const t = messages().time;
  if (seconds >= 3600) return t.hours(Math.ceil(seconds / 3600));
  return t.minutes(Math.max(1, Math.ceil(seconds / 60)));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function clock(date: Date): string {
  const h = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${minutes} ${h < 12 ? 'am' : 'pm'}`;
}

/** "1:00 pm" */
export function formatClock(date: Date): string {
  return clock(date);
}

/** "October 01, 2026": the day heading above a group of transactions. */
export function formatDayHeading(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${String(date.getDate()).padStart(2, '0')}, ${date.getFullYear()}`;
}

/** "October 1, 2026 at 4:00 pm" */
export function formatReceiptDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} at ${clock(date)}`;
}

/** "just now", "25m ago", "3h ago", "2d ago", then the date. */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  const t = messages().time;
  if (seconds < 60) return t.justNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return t.daysAgo(days);
  return formatDayHeading(date);
}
