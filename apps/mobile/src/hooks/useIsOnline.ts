import { useSyncExternalStore } from 'react';

import { getConnectivity, subscribeConnectivity } from '../services/connectivity';

const getOnline = () => getConnectivity().online;

/**
 * Whether the phone can reach the internet right now, read from the app-wide connectivity observable
 * (`services/connectivity.ts`). Unknown (NetInfo still probing) counts as online.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribeConnectivity, getOnline);
}
