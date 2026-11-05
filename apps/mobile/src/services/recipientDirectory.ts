import { AVATAR_COLORS } from '../config/sendMethods';
import type { Recipient } from '../types/recipient';
import { lookupUserByShortId, type UserLookup } from './api/users';

/** Recipients resolved from the server this session. The Send steps pass only an id, so they read from here. */
const resolved = new Map<string, Recipient>();

function initialsOf(name: string, fallback: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]);
  return (letters.join('') || fallback.slice(0, 2)).toUpperCase();
}

function colorFor(shortId: string): string {
  let hash = 0;
  for (const char of shortId) hash = (hash + char.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
}

function toRecipient(user: UserLookup): Recipient {
  return {
    id: user.shortId,
    name: user.displayName,
    initials: initialsOf(user.displayName, user.shortId),
    color: colorFor(user.shortId),
    provider: 'HoneBill',
    account: user.shortId,
    shortId: user.shortId,
    favorite: false,
  };
}

/** Looks the short ID up on the server. `null` means no account has it. */
export async function resolveRecipient(shortId: string, signal?: AbortSignal): Promise<Recipient | null> {
  const user = await lookupUserByShortId(shortId, signal);
  if (!user) return null;
  const recipient = toRecipient(user);
  resolved.set(recipient.id, recipient);
  return recipient;
}

/** A recipient resolved this session. */
export function findRecipientById(id: string): Recipient | undefined {
  return resolved.get(id);
}

/** Pulls the short ID out of a scanned HoneBill QR (`honebill://relay-voucher?id=XXXXXX&amount=...`). */
export function parseRecipientQr(data: string): string | null {
  if (!data.startsWith('honebill://')) return null;
  const match = /[?&]id=([0-9A-Za-z]{6})(?:&|$)/.exec(data);
  return match ? match[1] : null;
}
