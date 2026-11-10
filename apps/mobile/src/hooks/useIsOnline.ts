import { useNetInfo } from '@react-native-community/netinfo';

/**
 * Whether the phone can reach the internet right now. `isInternetReachable` is `null` while NetInfo is still
 * probing; that counts as online so a brief unknown does not push a connected user into the offline flow, and a
 * request that then fails reports its own error. An explicit `false` from either field means offline.
 */
export function useIsOnline(): boolean {
  const { isConnected, isInternetReachable } = useNetInfo();
  return isConnected !== false && isInternetReachable !== false;
}
