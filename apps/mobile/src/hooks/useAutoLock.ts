import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

import { AUTO_LOCK_AFTER_MS } from '../config/limits';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { whenLockFree } from '../services/lockHold';

/**
 * Locks the wallet when the app has been out of sight for `AUTO_LOCK_AFTER_MS`: signs out (drops the in-memory account
 * and server session) and shows the MPIN screen. Time is measured with the clock, not a timer, because timers stop
 * once the app is in the background. A payment in flight holds the lock off (see `lockHold.ts`); it locks as soon as
 * that payment ends.
 *
 * Only `background` counts as leaving: iOS reports `inactive` for the app switcher, a system dialog or a swipe-down
 * panel, which would lock on every glance.
 */
export function useAutoLock(navigation: NavigationContainerRefWithCurrent<RootStackParamList>): void {
  const { activeAccount, logout } = useAuth();
  const signedIn = activeAccount !== null;
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  useEffect(() => {
    if (!signedIn) return;
    let leftAt: number | null = null;
    let cancelWait: (() => void) | null = null;

    const lock = () => {
      cancelWait = null;
      void logoutRef.current();
      if (navigation.isReady()) {
        navigation.reset({ index: 0, routes: [{ name: 'Login', params: { reason: 'locked' } }] });
      }
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt ??= Date.now();
        return;
      }
      if (state !== 'active' || leftAt === null) return;
      const away = Date.now() - leftAt;
      leftAt = null;
      if (away >= AUTO_LOCK_AFTER_MS && !cancelWait) cancelWait = whenLockFree(lock);
    });

    return () => {
      sub.remove();
      cancelWait?.();
    };
  }, [signedIn, navigation]);
}
