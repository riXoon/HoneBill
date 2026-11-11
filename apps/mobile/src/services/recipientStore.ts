import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Recipient } from '../types/recipient';

/** Per-account lists behind the Send screen's "Recent" and "Favorites" rows. Public details only: no keys. */
export type RecipientLists = { recents: Recipient[]; favorites: Recipient[] };

const MAX_RECENTS = 12;
const keyFor = (accountShortId: string) => `honebill.recipients.${accountShortId}`;

function isRecipient(value: unknown): value is Recipient {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.shortId === 'string' && typeof v.name === 'string';
}

export async function loadRecipientLists(accountShortId: string): Promise<RecipientLists> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(accountShortId));
    if (!raw) return { recents: [], favorites: [] };
    const parsed = JSON.parse(raw) as Partial<Record<keyof RecipientLists, unknown>>;
    const clean = (list: unknown) => (Array.isArray(list) ? list.filter(isRecipient) : []);
    return { recents: clean(parsed.recents), favorites: clean(parsed.favorites) };
  } catch {
    return { recents: [], favorites: [] };
  }
}

async function save(accountShortId: string, lists: RecipientLists): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(accountShortId), JSON.stringify(lists));
  } catch {
    // Not saving only means the lists are empty next launch; sending is unaffected.
  }
}

/** Moves `recipient` to the front of Recent (once, however often they are paid). */
export async function addRecentRecipient(accountShortId: string, recipient: Recipient): Promise<void> {
  const lists = await loadRecipientLists(accountShortId);
  const recents = [recipient, ...lists.recents.filter((r) => r.id !== recipient.id)].slice(0, MAX_RECENTS);
  await save(accountShortId, { ...lists, recents });
}

/** Adds past recipients after the ones already listed (they are older), keeping the cap. */
export async function mergeRecentRecipients(accountShortId: string, older: Recipient[]): Promise<RecipientLists> {
  const lists = await loadRecipientLists(accountShortId);
  const known = new Set(lists.recents.map((r) => r.id));
  const added = older.filter((r) => !known.has(r.id));
  if (added.length === 0) return lists;
  const next = { ...lists, recents: [...lists.recents, ...added].slice(0, MAX_RECENTS) };
  await save(accountShortId, next);
  return next;
}

/** Adds or removes a favorite and returns the lists as saved. */
export async function setFavoriteRecipient(accountShortId: string, recipient: Recipient, favorite: boolean): Promise<RecipientLists> {
  const lists = await loadRecipientLists(accountShortId);
  const others = lists.favorites.filter((r) => r.id !== recipient.id);
  const next = { ...lists, favorites: favorite ? [recipient, ...others] : others };
  await save(accountShortId, next);
  return next;
}
