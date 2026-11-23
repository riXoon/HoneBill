import type { Transaction } from '../types/transaction';

/**
 * A move between the user's own online and offline wallets, as the two History entries it makes: the debit on the
 * side the money left, and the credit on the side it arrived. Each wallet's view lists its own side ("Transferred to
 * Offline Balance" under Online, "Received from Online Balance" under Offline); History's "All" shows it once.
 *
 * The server builds the same two entries from its own record of the move (backend `getHistory`), which is what other
 * devices see. These are the phone's copy of them, shown straight away and dropped once the server's arrive.
 */
export function buildMoveEntries(to: 'online' | 'offline', amount: number, hash: string, status: 'completed' | 'pending' = 'completed'): Transaction[] {
  const toOffline = to === 'offline';
  const base = { timestamp: Date.now(), assetCode: 'PHPC', amount, status, ref: hash } as const;
  return [
    {
      ...base,
      id: `move:${hash}:out`,
      source: toOffline ? 'wallet' : 'offline',
      direction: 'out',
      description: toOffline ? 'Transferred to Offline Balance' : 'Transferred to Online Balance',
    },
    {
      ...base,
      id: `move:${hash}:in`,
      source: toOffline ? 'offline' : 'wallet',
      direction: 'in',
      description: toOffline ? 'Received from Online Balance' : 'Received from Offline Balance',
      mirror: true,
    },
  ];
}
