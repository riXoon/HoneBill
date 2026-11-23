import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { useAuth } from '../context/AuthContext';
import { getOfflineSetup } from '../services/offline/offlineConfig';

/** Reads the same cached token the voucher signer uses, including when the phone is offline. */
export function useOfflineTokenSymbol(offline: boolean): string {
  const { activeAccount } = useAuth();
  const publicKey = activeAccount?.stellarPublicKey;
  const [token, setToken] = useState<{ publicKey: string; symbol: string }>();

  useFocusEffect(useCallback(() => {
    if (!offline || !publicKey) return;
    let active = true;
    void getOfflineSetup(publicKey).then((setup) => {
      if (active) setToken({ publicKey, symbol: setup?.config.tokenSymbol ?? 'PHPC' });
    });
    return () => { active = false; };
  }, [offline, publicKey]));

  return token && token.publicKey === publicKey ? token.symbol : 'PHPC';
}
