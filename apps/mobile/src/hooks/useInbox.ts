import type { InboxItem } from '../types/inbox';

/**
 * The Inbox entries. There is no notifications service yet, so this is always empty and the screen
 * shows its empty state. When the backend has one, fetch it here and the screen needs no other change.
 */
export function useInbox(): { items: InboxItem[] } {
  return { items: [] };
}
