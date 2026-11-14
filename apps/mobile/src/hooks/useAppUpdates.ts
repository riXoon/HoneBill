import { useSyncExternalStore } from 'react';

import { getUpdateState, subscribeUpdates, type UpdateState } from '../services/appUpdates';

/** The app-update state (Inbox entries and whether an update is required), re-rendering when it changes. */
export function useAppUpdates(): UpdateState {
  return useSyncExternalStore(subscribeUpdates, getUpdateState);
}
