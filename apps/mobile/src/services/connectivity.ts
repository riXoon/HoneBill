import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { BehaviorSubject, Observable, debounceTime, distinctUntilChanged, filter, map, pairwise } from 'rxjs';

/**
 * The phone's connectivity as one app-wide observable (ported from `_legacy/services/connectionService.ts`).
 * Screens read it through `useIsOnline`; services such as sync subscribe to `online$` / `reconnected$` directly, so
 * reacting to a reconnect does not depend on which screen happens to be mounted.
 */
export type Connectivity = {
  /** Whether the internet is reachable. While NetInfo is still probing this is `true`: see `toConnectivity`. */
  online: boolean;
  /** NetInfo has reported at least once. */
  known: boolean;
};

/**
 * A reconnect only counts once the connection has held this long, so a flapping signal (common on cheap phones moving
 * between cells) triggers one sync, not one per flap.
 */
const RECONNECT_SETTLE_MS = 1_500;

/**
 * `isInternetReachable` is `null` while NetInfo probes; that counts as online so a brief unknown does not push a
 * connected user into the offline flow, and a request that then fails reports its own error. An explicit `false`
 * from either field means offline.
 */
function toConnectivity(state: NetInfoState): Connectivity {
  return { online: state.isConnected !== false && state.isInternetReachable !== false, known: true };
}

const subject = new BehaviorSubject<Connectivity>({ online: true, known: false });
let started = false;

/** Starts the NetInfo listener on first use. It lives as long as the app, so it is never removed. */
function ensureStarted(): void {
  if (started) return;
  started = true;
  // NetInfo calls the listener with the current state soon after subscribing, then on every change.
  NetInfo.addEventListener((state) => {
    const next = toConnectivity(state);
    const current = subject.value;
    if (next.online !== current.online || next.known !== current.known) subject.next(next);
  });
}

/** Current connectivity, then every change. */
export const connectivity$: Observable<Connectivity> = new Observable<Connectivity>((subscriber) => {
  ensureStarted();
  return subject.subscribe(subscriber);
});

/** Current online flag, then every change. */
export const online$: Observable<boolean> = connectivity$.pipe(
  map((c) => c.online),
  distinctUntilChanged(),
);

/** Emits once each time the phone is back online after being offline, after the connection has held steady. */
export const reconnected$: Observable<void> = online$.pipe(
  debounceTime(RECONNECT_SETTLE_MS),
  distinctUntilChanged(),
  pairwise(),
  filter(([was, is]) => !was && is),
  map(() => undefined),
);

/** Synchronous read for code outside React (e.g. after an `await`). */
export function getConnectivity(): Connectivity {
  ensureStarted();
  return subject.value;
}

/** `useSyncExternalStore` adapter: calls `listener` on each change after subscribing. */
export function subscribeConnectivity(listener: () => void): () => void {
  ensureStarted();
  let first = true;
  const subscription = subject.subscribe(() => {
    // The BehaviorSubject replays the current value on subscribe; React already read it via the snapshot.
    if (first) {
      first = false;
      return;
    }
    listener();
  });
  return () => subscription.unsubscribe();
}
