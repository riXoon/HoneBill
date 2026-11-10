import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useWalletData } from '../context/WalletDataContext';
import { errorMessage, UserFacingError } from '../services/api/client';
import { reportError } from '../services/errorReporting';
import { PendingTransactionError } from '../services/stellar/sorobanRpc';
import { moveToOffline, moveToOnline } from '../services/walletActions';
import { afterNextPaint } from '../utils/async';
import { formatPeso } from '../utils/format';

const LABEL = { online: 'online', offline: 'offline' } as const;

/**
 * Moves funds between the user's own wallets (Transfer to Online / Offline). `busy` covers the whole
 * sign-prepare-submit-confirm run, which takes several seconds, so the screen can lock the form.
 */
export function useWalletTransfer(to: 'online' | 'offline', onDone: () => void) {
  const { activeAccount } = useAuth();
  const { refresh } = useWalletData();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const transfer = useCallback(
    async (amount: number) => {
      if (!activeAccount || running.current) return;
      running.current = true;
      setBusy(true);
      // Deriving the key is CPU work; let "Transferring…" draw first.
      await afterNextPaint();
      try {
        await (to === 'online' ? moveToOnline : moveToOffline)(activeAccount.stellarPublicKey, amount);
        void refresh({ force: true });
        Alert.alert('Transfer complete', `${formatPeso(amount)} is now in your ${LABEL[to]} wallet.`, [
          { text: 'OK', onPress: onDone },
        ]);
      } catch (error) {
        // Submitted but unconfirmed: the balances may already have changed.
        if (error instanceof PendingTransactionError) void refresh({ force: true });
        if (!(error instanceof UserFacingError)) reportError(error, { step: `transferTo${to}` });
        Alert.alert('Transfer not completed', errorMessage(error));
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [activeAccount, to, refresh, onDone],
  );

  return { busy, transfer };
}
