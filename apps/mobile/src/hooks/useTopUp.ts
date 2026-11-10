import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useWalletData } from '../context/WalletDataContext';
import { errorMessage, UserFacingError } from '../services/api/client';
import { reportError } from '../services/errorReporting';
import { topUp, type TopUpStep } from '../services/walletActions';
import { afterNextPaint } from '../utils/async';
import { formatPeso } from '../utils/format';

/**
 * Adds PHPC to the online wallet through the anchor. `busy` covers the whole run (trustline on the first top-up,
 * deposit, payment), which takes several seconds, so the screen can lock the form and say which step it is on.
 */
export function useTopUp(onDone: () => void) {
  const { activeAccount } = useAuth();
  const { refresh } = useWalletData();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<TopUpStep | null>(null);
  const running = useRef(false);

  const submit = useCallback(
    async (amount: number) => {
      if (!activeAccount || running.current) return;
      running.current = true;
      setBusy(true);
      // Deriving the wallet key is CPU work; let "Adding funds…" draw first.
      await afterNextPaint();
      try {
        await topUp(activeAccount.stellarPublicKey, amount, setStep);
        void refresh({ force: true });
        Alert.alert('Top-up complete', `${formatPeso(amount)} was added to your online wallet.`, [
          { text: 'OK', onPress: onDone },
        ]);
      } catch (error) {
        if (!(error instanceof UserFacingError)) reportError(error, { step: 'topUp' });
        Alert.alert('Top-up not completed', errorMessage(error));
      } finally {
        running.current = false;
        setBusy(false);
        setStep(null);
      }
    },
    [activeAccount, refresh, onDone],
  );

  return { busy, step, submit };
}
