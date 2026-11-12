import { AppState, type AppStateStatus } from 'react-native';
import { Observable, distinctUntilChanged, filter, map, pairwise, startWith } from 'rxjs';

/** AppState as an observable: the current state, then every change. */
const appState$: Observable<AppStateStatus> = new Observable<AppStateStatus>((subscriber) => {
  subscriber.next(AppState.currentState);
  const subscription = AppState.addEventListener('change', (state) => subscriber.next(state));
  return () => subscription.remove();
});

/** Whether the app is on screen (`active`). iOS passes through `inactive` for the app switcher, which counts as not. */
export const appActive$: Observable<boolean> = appState$.pipe(
  map((state) => state === 'active'),
  distinctUntilChanged(),
);

/** Emits each time the app comes back on screen after being in the background. */
export const foregrounded$: Observable<void> = appActive$.pipe(
  startWith(true),
  pairwise(),
  filter(([was, is]) => !was && is),
  map(() => undefined),
);
