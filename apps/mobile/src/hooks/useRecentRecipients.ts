import type { Recipient } from '../types/recipient';

/**
 * People the user sent to lately, for the "Recent" and "Favorites" rows on Send. The backend's history
 * does not expose recipients' short IDs, and favorites are not stored anywhere yet, so this is always
 * empty. When either exists, load it here and the screen needs no other change.
 */
export function useRecentRecipients(): { recents: Recipient[]; favoriteIds: ReadonlySet<string> } {
  return { recents: [], favoriteIds: new Set() };
}
