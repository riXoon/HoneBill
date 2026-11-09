/** One Inbox entry. The notifications service does not exist yet, so the Inbox is empty until it does. */
export type InboxItem = {
  id: string;
  kind: 'received' | 'sent';
  title: string;
  body: string;
  /** Already formatted for display, e.g. "25m ago". */
  time: string;
  unread: boolean;
  /** "update" holds app notices rather than transfers. */
  category: 'transfer' | 'update';
};

export const INBOX_FILTERS = ['All', 'Unread', 'Updates'] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export function filterInbox(items: InboxItem[], filter: InboxFilter): InboxItem[] {
  if (filter === 'Unread') return items.filter((i) => i.unread);
  if (filter === 'Updates') return items.filter((i) => i.category === 'update');
  return items;
}
