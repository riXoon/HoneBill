import { useCallback, useRef, useState } from 'react';

import type { ResultDialogProps } from '../components/ui/ResultDialog';
import { useAuth } from '../context/AuthContext';
import { messages } from '../i18n';
import { useWalletData } from '../context/WalletDataContext';
import { errorMessage, UserFacingError } from '../services/api/client';
import { reportError } from '../services/errorReporting';
import { errorHaptic, successHaptic } from '../services/haptics';
import { topUp, type TopUpStep } from '../services/walletActions';
import { afterNextPaint } from '../utils/async';
import { formatPeso } from '../utils/format';

type Outcome = Pick<ResultDialogProps, 'mood' | 'title' | 'message' | 'buttonLabel'> & { done: boolean };

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
  const [outcome, setOutcome] = useState<Outcome | null>(null);

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
        successHaptic();
        const t = messages();
        setOutcome({
          mood: 'success',
          title: t.topUp.successTitle,
          message: t.topUp.successBody(formatPeso(amount)),
          buttonLabel: t.common.done,
          done: true,
        });
      } catch (error) {
        if (!(error instanceof UserFacingError)) reportError(error, { step: 'topUp' });
        errorHaptic();
        const t = messages();
        setOutcome({ mood: 'fail', title: t.topUp.failTitle, message: errorMessage(error), buttonLabel: t.common.tryAgain, done: false });
      } finally {
        running.current = false;
        setBusy(false);
        setStep(null);
      }
    },
    [activeAccount, refresh],
  );

  /** Props for the result dialog: success leaves the screen once acknowledged, a failure stays for another try. */
  const dialog: ResultDialogProps = {
    visible: outcome !== null,
    mood: outcome?.mood ?? 'success',
    title: outcome?.title ?? '',
    message: outcome?.message ?? '',
    buttonLabel: outcome?.buttonLabel,
    onDismiss: () => {
      const finished = outcome?.done;
      setOutcome(null);
      if (finished) onDone();
    },
  };

  return { busy, step, submit, dialog };
}
