import { useCallback, useEffect, useRef, useState } from 'react';
import { Easing, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { afterNextPaint } from '../../utils/async';

/** How long the full entrance runs. The tile timeline in `HiveEntrance` is a fraction of this, so it scales. */
export const HIVE_DURATION_MS = 1100;
/** If the animation callback is ever lost, still go on rather than strand the user on the screen. */
const FALLBACK_SLACK_MS = 700;

/**
 * Drives the honeycomb entrance (see `HiveEntrance`) and calls `onDone` once when it has finished, or at once
 * when the phone's "reduce motion" setting is on. Render `<HiveEntrance progress={progress} />` while `entering`
 * is true, and call `start()` when the user has succeeded (account created, signed in).
 *
 * `onDone` should be stable (wrap it in `useCallback`) and is where the screen navigates away.
 */
export function useHiveEntrance(
  onDone: () => void,
  durationMs: number = HIVE_DURATION_MS,
): { entering: boolean; progress: SharedValue<number>; start: () => Promise<void> } {
  const [entering, setEntering] = useState(false);
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const started = useRef(false);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (!entering) return;
    const timer = setTimeout(finish, durationMs + FALLBACK_SLACK_MS);
    return () => clearTimeout(timer);
  }, [entering, finish, durationMs]);

  const start = useCallback(async () => {
    // A ref, not the state: a second call in the same tick must not start another run.
    if (started.current) return;
    started.current = true;
    if (reduceMotion) {
      finish();
      return;
    }
    // Mounting the tiles also settles the screen (stopped mascot, locked inputs) before the zoom begins.
    setEntering(true);
    await afterNextPaint();
    progress.value = withTiming(1, { duration: durationMs, easing: Easing.linear }, (done) => {
      if (done) scheduleOnRN(finish);
    });
  }, [reduceMotion, finish, progress, durationMs]);

  return { entering, progress, start };
}
