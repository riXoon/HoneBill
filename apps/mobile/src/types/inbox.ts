/** One Inbox entry. Today these are the app's own update notices; transfer notifications will join them later. */
export type InboxItem = {
  id: string;
  kind: 'received' | 'sent' | 'update';
  title: string;
  body: string;
  /** Already formatted for display, e.g. "25m ago". */
  time: string;
  unread: boolean;
  /** "update" holds app notices rather than transfers. */
  category: 'transfer' | 'update';
  /** What tapping an update notice opens: that version's notes, or the download of a newer app. */
  update?: { type: 'notes'; version: string } | { type: 'download'; url: string | null };
};

export const INBOX_FILTERS = ['All', 'Unread', 'Updates'] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export function filterInbox(items: InboxItem[], filter: InboxFilter): InboxItem[] {
  if (filter === 'Unread') return items.filter((i) => i.unread);
  if (filter === 'Updates') return items.filter((i) => i.category === 'update');
  return items;
}
