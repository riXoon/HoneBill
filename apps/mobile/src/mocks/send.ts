import { splitPesos } from './home';

/** Mock data for the Send flow (Figma Send 1 - To ... Receipt) until the real directory, balance and ledger services are wired in. */
export type Recipient = {
  id: string;
  name: string;
  initials: string;
  /** Avatar fill, as set per contact in the design. */
  color: string;
  provider: string;
  account: string;
  shortId: string;
  favorite: boolean;
};

export const SHORT_ID_LENGTH = 5;
export const NOTE_MAX = 50;
/** Figma Send 2: "Available Balance" and "Transfer Limit" (sample values from the design). */
export const AVAILABLE_BALANCE = 1_000_000;
export const TRANSFER_LIMIT = 1_000_001;
/** Flat fee deducted on top of the amount ("a P0.50 service fee will be deducted"). */
export const SERVICE_FEE = 0.5;

const BLUE = '#00A1FF';
const GREEN = '#0BA98C';
const ORANGE = '#F08F31';

/** The "Recent" row on Send 1. */
export const mockRecents: Recipient[] = [
  { id: 'r1', name: 'Erickson Guhilde', initials: 'EG', color: BLUE, provider: 'G-Xchange / GCash', account: '0912 345 6789', shortId: 'ERK7Q', favorite: true },
  { id: 'r2', name: 'Cedric Mendoza', initials: 'CM', color: BLUE, provider: 'G-Xchange / GCash', account: '0912 345 6789', shortId: 'CDM3X', favorite: true },
  { id: 'r3', name: 'Matt Henry Buenaventura', initials: 'MH', color: GREEN, provider: 'Maya', account: '0912 345 6789', shortId: 'MHB9K', favorite: false },
  { id: 'r4', name: 'Kenneth Romo', initials: 'KR', color: ORANGE, provider: 'HoneBill', account: '1270199901', shortId: 'KNR2D', favorite: false },
  { id: 'r5', name: 'Meryl Alcantra', initials: 'MA', color: ORANGE, provider: 'HoneBill', account: '1270199901', shortId: 'MRL5A', favorite: false },
];

/** The recipient the Send 2-Receipt frames show; reached by typing her short ID on Send 1. */
const heila: Recipient = {
  id: 'r0',
  name: 'Heila Longaquit',
  initials: 'HL',
  color: BLUE,
  provider: 'G-Xchange / GCash',
  account: '0912 345 6789',
  shortId: 'PRC4F',
  favorite: true,
};

const directory: Recipient[] = [heila, ...mockRecents];

export function findRecipientById(id: string): Recipient | undefined {
  return directory.find((r) => r.id === id);
}

export function findRecipientByShortId(shortId: string): Recipient | undefined {
  const wanted = shortId.trim().toUpperCase();
  return directory.find((r) => r.shortId === wanted);
}

/** The pay-to rails listed under "Methods" on Send 1. */
export const SEND_METHODS = [
  { key: 'honebill', label: 'Honebill', letter: 'H', color: ORANGE, isDefault: true },
  { key: 'maya', label: 'Maya', letter: 'M', color: GREEN, isDefault: false },
  { key: 'gcash', label: 'G-Xchange Inc. / GCash', letter: 'G', color: BLUE, isDefault: false },
] as const;
export type SendMethodKey = (typeof SEND_METHODS)[number]['key'];

/** How the signed transfer leaves the phone (Send 4). */
export type DispatchMethod = 'sms' | 'relay';

/** 1000 -> "₱1,000.00" */
export function formatPeso(amount: number): string {
  const { whole, cents } = splitPesos(amount);
  return `₱${whole}.${cents}`;
}

/** 1000 -> "1,000" (the whole-peso form used by the balance hints). */
export function formatWhole(amount: number): string {
  return splitPesos(amount).whole;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 1, 2026 at 4:00 pm" */
export function formatReceiptDate(date: Date): string {
  const h = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} at ${hour12}:${minutes} ${h < 12 ? 'am' : 'pm'}`;
}
