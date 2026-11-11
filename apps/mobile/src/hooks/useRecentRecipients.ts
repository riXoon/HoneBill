import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { useWalletData } from '../context/WalletDataContext';
import { rememberRecipient, resolveRecipient } from '../services/recipientDirectory';
import { loadRecipientLists, mergeRecentRecipients, setFavoriteRecipient, type RecipientLists } from '../services/recipientStore';
import type { Recipient } from '../types/recipient';
import type { Transaction } from '../types/transaction';

const EMPTY: RecipientLists = { recents: [], favorites: [] };
const BACKFILL_MAX = 12;

/** Short IDs this account paid, newest first, once each, from the activity the server reported. */
function paidShortIds(transactions: Transaction[], own: string | undefined): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const tx of [...transactions].sort((a, b) => b.timestamp - a.timestamp)) {
    const id = tx.counterpartyShortId;
    if (tx.direction !== 'out' || tx.status === 'failed' || !id || id === own || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * The "Recent" and "Favorites" rows on Send: people this account has paid, and the ones it starred. Stored on the
 * device per account and reloaded whenever the screen is focused, so a payment or a star made on a later step shows up.
 * Payments made before the lists existed come from the server's history, which names the other party's short ID;
 * each is looked up once and then kept on the device.
 */
export function useRecentRecipients() {
  const { activeAccount } = useAuth();
  const { transactions } = useWalletData();
  const accountId = activeAccount?.shortId;
  const [lists, setLists] = useState<RecipientLists>(EMPTY);

  useFocusEffect(
    useCallback(() => {
      if (!accountId) return;
      const controller = new AbortController();
      const show = (next: RecipientLists) => {
        if (controller.signal.aborted) return;
        // The later Send steps look recipients up by id from memory, so make the stored ones findable again.
        [...next.recents, ...next.favorites].forEach(rememberRecipient);
        setLists(next);
      };

      void (async () => {
        const loaded = await loadRecipientLists(accountId);
        show(loaded);

        const listed = new Set(loaded.recents.map((r) => r.id));
        const missing = paidShortIds(transactions, accountId)
          .filter((id) => !listed.has(id))
          .slice(0, Math.max(0, BACKFILL_MAX - loaded.recents.length));
        if (missing.length === 0) return;

        // Best effort: with no connection or an unknown ID the row just stays out until the next visit.
        const results = await Promise.allSettled(missing.map((id) => resolveRecipient(id, controller.signal)));
        const found = results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
        if (found.length > 0 && !controller.signal.aborted) show(await mergeRecentRecipients(accountId, found));
      })();

      return () => controller.abort();
    }, [accountId, transactions]),
  );

  const isFavorite = useCallback((id: string) => lists.favorites.some((r) => r.id === id), [lists.favorites]);

  const toggleFavorite = useCallback(
    async (recipient: Recipient) => {
      if (!accountId) return;
      const next = await setFavoriteRecipient(accountId, recipient, !lists.favorites.some((r) => r.id === recipient.id));
      setLists(next);
    },
    [accountId, lists.favorites],
  );

  return { recents: lists.recents, favorites: lists.favorites, isFavorite, toggleFavorite };
}
