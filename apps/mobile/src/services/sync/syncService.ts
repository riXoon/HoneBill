import {
  BehaviorSubject,
  EMPTY,
  Observable,
  Subject,
  combineLatest,
  defer,
  exhaustMap,
  filter,
  interval,
  map,
  merge,
  switchMap,
  takeUntil,
  timer,
  type Subscription,
} from 'rxjs';

import { reportError } from '../errorReporting';
import { appActive$, foregrounded$ } from '../appLifecycle';
import { getConnectivity, online$, reconnected$ } from '../connectivity';

/**
 * One place that decides when the app syncs (ported from `_legacy/services/syncService.ts`, generalised from "flush
 * the payment queue on reconnect" to a list of steps).
 *
 * Triggers: the connection coming back, the app coming back on screen, a slow interval while online and on screen,
 * and pull-to-refresh. They all feed one pipeline that runs at most one sync at a time (`exhaustMap`: a trigger that
 * arrives mid-sync is dropped, the running sync already covers it). A sync runs the registered steps in order, e.g.
 * send queued offline payments first, then read fresh balances and history, so the history already includes them.
 * Losing the connection mid-sync cancels it; the next reconnect starts over.
 */

export type SyncTrigger = 'reconnect' | 'foreground' | 'interval' | 'manual';

/** A unit of sync work. It must be safe to repeat, and should stop early when `signal` aborts. */
export type SyncStep = (context: { trigger: SyncTrigger; signal: AbortSignal }) => Promise<void>;

export type SyncState = {
  syncing: boolean;
  /** Unix ms when the last sync finished (successfully or not), `null` before the first. */
  lastSyncedAt: number | null;
};

/** Fresh enough to see incoming payments while the app is open, rare enough to spare battery and data. */
const INTERVAL_MS = 60_000;
/** Random wait before a reconnect sync, so phones regaining signal together (a cell tower back up) spread out. */
const MAX_RECONNECT_JITTER_MS = 3_000;

type RegisteredStep = { name: string; order: number; run: SyncStep };

class SyncService {
  private steps: RegisteredStep[] = [];
  private readonly manual$ = new Subject<void>();
  private readonly stateSubject = new BehaviorSubject<SyncState>({ syncing: false, lastSyncedAt: null });
  private subscription: Subscription | null = null;

  readonly state$: Observable<SyncState> = this.stateSubject.asObservable();

  /** Starts listening for triggers. Safe to call more than once. Returns `stop`, for a `useEffect` cleanup. */
  start(): () => void {
    if (!this.subscription) {
      const automatic$ = merge(
        reconnected$.pipe(map((): SyncTrigger => 'reconnect')),
        foregrounded$.pipe(map((): SyncTrigger => 'foreground')),
        combineLatest([appActive$, online$]).pipe(
          switchMap(([active, online]) => (active && online ? interval(INTERVAL_MS) : EMPTY)),
          map((): SyncTrigger => 'interval'),
        ),
      ).pipe(filter(() => getConnectivity().online));

      // Pull-to-refresh runs even offline: each step reports for itself why it cannot load.
      const manual$ = this.manual$.pipe(map((): SyncTrigger => 'manual'));

      this.subscription = merge(automatic$, manual$)
        .pipe(exhaustMap((trigger) => this.run(trigger)))
        .subscribe();
    }
    return () => this.stop();
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  /** Pull-to-refresh, or any explicit "sync now". Ignored while a sync is already running. */
  requestSync(): void {
    this.manual$.next();
  }

  /**
   * Adds a step to every sync, run in ascending `order`. Returns a function that removes it (for a `useEffect`
   * cleanup), so a step tied to the signed-in account goes away with it.
   */
  registerStep(name: string, run: SyncStep, order: number): () => void {
    const entry: RegisteredStep = { name, order, run };
    this.steps = [...this.steps.filter((s) => s.name !== name), entry].sort((a, b) => a.order - b.order);
    return () => {
      this.steps = this.steps.filter((s) => s !== entry);
    };
  }

  private run(trigger: SyncTrigger): Observable<void> {
    const offline$ = online$.pipe(filter((online) => !online));
    const work$ = defer(() => {
      const wait = trigger === 'reconnect' ? Math.random() * MAX_RECONNECT_JITTER_MS : 0;
      return timer(wait).pipe(switchMap(() => this.runSteps(trigger)));
    });
    // Manual syncs are allowed offline, so only automatic ones are cancelled by losing the connection.
    return trigger === 'manual' ? work$ : work$.pipe(takeUntil(offline$));
  }

  private runSteps(trigger: SyncTrigger): Observable<void> {
    return new Observable<void>((subscriber) => {
      const controller = new AbortController();
      this.stateSubject.next({ ...this.stateSubject.value, syncing: true });

      void (async () => {
        // Snapshot: a step registered or removed mid-sync takes effect on the next one.
        for (const step of this.steps) {
          if (controller.signal.aborted) break;
          try {
            await step.run({ trigger, signal: controller.signal });
          } catch (error) {
            // One failing step must not keep the others (e.g. the history refresh) from running.
            if (!controller.signal.aborted) reportError(error, { step: `sync:${step.name}`, trigger });
          }
        }
        subscriber.complete();
      })();

      return () => {
        // Runs on completion and on cancellation (connection lost, service stopped).
        controller.abort();
        this.stateSubject.next({ syncing: false, lastSyncedAt: Date.now() });
      };
    });
  }
}

export const syncService = new SyncService();
