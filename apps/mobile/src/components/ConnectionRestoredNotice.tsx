import { useEffect, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { useIsOnline } from '../hooks/useIsOnline';
import { reconnected$ } from '../services/connectivity';
import { ConnectivityNoticeDialog } from './ui/ConnectivityNoticeDialog';

/**
 * Tells a signed-in user, on whatever screen they are, that the connection is back and online features work again.
 * Mounted once at the app root. `reconnected$` only fires after a real offline spell and once the connection has held
 * for a moment, so a flapping signal does not keep raising it.
 */
export function ConnectionRestoredNotice() {
  const { activeAccount } = useAuth();
  const signedIn = activeAccount !== null && activeAccount !== undefined;
  const online = useIsOnline();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setVisible(false);
      return;
    }
    const subscription = reconnected$.subscribe(() => setVisible(true));
    return () => subscription.unsubscribe();
  }, [signedIn]);

  // Lost again before it was read: "back online" is no longer true.
  return <ConnectivityNoticeDialog notice={visible && online ? 'restored' : null} onDismiss={() => setVisible(false)} />;
}
