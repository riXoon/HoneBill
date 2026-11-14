import { useMemo } from 'react';

import type { InboxItem } from '../types/inbox';
import { useAppUpdates } from './useAppUpdates';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * The Inbox entries. For now these are the app's own update notices (what's new, update available), kept on this
 * phone. There is no notifications service for transfers yet; when the backend has one, merge it in here and the
 * screen needs no other change.
 */
export function useInbox(): { items: InboxItem[] } {
  const { entries } = useAppUpdates();
  const items = useMemo(
    () =>
      entries.map<InboxItem>((entry) => ({
        id: entry.id,
        kind: 'update',
        title: entry.title,
        body: entry.body,
        time: shortDate(entry.at),
        unread: !entry.read,
        category: 'update',
        update: entry.kind === 'available' ? { type: 'download', url: entry.downloadUrl ?? null } : { type: 'notes', version: entry.version },
      })),
    [entries],
  );
  return { items };
}
