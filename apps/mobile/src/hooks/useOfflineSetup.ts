import { useEffect } from 'react';

import { useAuth } from '../context/AuthContext';
import { reportError } from '../services/errorReporting';
import { ensureOfflineReady } from '../services/offline/setup';
import { useIsOnline } from './useIsOnline';

/**
 * Prepares offline payments in the background whenever the phone is online with a signed-in account, so a
 * voucher can be signed later with no connection. It waits for an idle moment (the key derivation
 * is CPU work) and a failure is only logged: sending offline then asks the user to connect once.
 */
export function useOfflineSetup(): void {
  const { activeAccount } = useAuth();
  const online = useIsOnline();
  const walletPublicKey = activeAccount?.stellarPublicKey ?? null;

  useEffect(() => {
    if (!walletPublicKey || !online) return;
    const controller = new AbortController();
    // Idle time, so the key derivation does not compete with the first frames.
    const idle = requestIdleCallback(() => {
      ensureOfflineReady(walletPublicKey, controller.signal).catch((error) => {
        if (!controller.signal.aborted) reportError(error, { step: 'offlineSetup' });
      });
    });
    return () => {
      cancelIdleCallback(idle);
      controller.abort();
    };
  }, [walletPublicKey, online]);
}
