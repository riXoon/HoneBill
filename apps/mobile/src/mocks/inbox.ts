/** Mock inbox for the Inbox tab (Figma 870:3123) until the notifications service is wired in. */
export type InboxItem = {
  id: string;
  kind: 'received' | 'sent';
  title: string;
  body: string;
  time: string;
  /** Not shown in the design; assumed so the "Unread" chip has something to filter. */
  unread: boolean;
  /** "Updates" holds app notices rather than transfers. The design only shows transfers. */
  category: 'transfer' | 'update';
};

export const INBOX_FILTERS = ['All', 'Unread', 'Updates'] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const mockInbox = {
  items: [
    { id: 'i1', kind: 'received', title: 'Transfer received from Aaron Gabriel Chavez', body: 'Aaron Gabriel Chavez sent you ₱125,000', time: '25m ago', unread: true, category: 'transfer' },
    { id: 'i2', kind: 'received', title: 'Transfer received from Nicole Mayo', body: 'Nicole Mayo sent you ₱125,000', time: '24m ago', unread: true, category: 'transfer' },
    { id: 'i3', kind: 'received', title: 'Transfer received from Danica Manlangit', body: 'Danica Manlangit sent you ₱125,000', time: '21m ago', unread: true, category: 'transfer' },
    { id: 'i4', kind: 'sent', title: 'Transfer successful to Lawrence Savariz', body: 'You sent ₱125,000 to Lawrence Savariz', time: '19m ago', unread: false, category: 'transfer' },
    { id: 'i5', kind: 'sent', title: 'Transfer successful to Mark Vincent Briagas', body: 'You sent ₱125,000 to Mark Vincent Briagas', time: '16m ago', unread: false, category: 'transfer' },
    { id: 'i6', kind: 'sent', title: 'Transfer successful to Chong Huazai', body: 'You sent ₱125,000 to Chong Huazai', time: '11m ago', unread: false, category: 'transfer' },
  ] as InboxItem[],
};

export function filterInbox(items: InboxItem[], filter: InboxFilter): InboxItem[] {
  if (filter === 'Unread') return items.filter((i) => i.unread);
  if (filter === 'Updates') return items.filter((i) => i.category === 'update');
  return items;
}
