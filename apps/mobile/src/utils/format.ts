/** 100000 -> { whole: "100,000", cents: "00" } */
export function splitPesos(amount: number): { whole: string; cents: string } {
  const [whole, cents] = amount.toFixed(2).split('.');
  return { whole: whole.replace(/\B(?=(\d{3})+(?!\d))/g, ','), cents };
}

/** 1000 -> "₱1,000.00" */
export function formatPeso(amount: number): string {
  const { whole, cents } = splitPesos(amount);
  return `₱${whole}.${cents}`;
}

/** 1000 -> "1,000" (the whole-peso form used by the balance hints). */
export function formatWhole(amount: number): string {
  return splitPesos(amount).whole;
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
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDayHeading(date);
}
