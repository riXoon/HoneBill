import { useCallback, useRef, useState } from 'react';

import type { ResultDialogProps } from '../components/ui/ResultDialog';
import { useAuth } from '../context/AuthContext';
import { messages } from '../i18n';
import { useWalletData } from '../context/WalletDataContext';
import { errorMessage, UserFacingError } from '../services/api/client';
import { reportError } from '../services/errorReporting';
import { buildMoveEntries } from '../services/ownTransfers';
import { PendingTransactionError } from '../services/stellar/sorobanRpc';
import { moveToOffline, moveToOnline } from '../services/walletActions';
import { errorHaptic, successHaptic } from '../services/haptics';
import { afterNextPaint } from '../utils/async';
import { formatPeso } from '../utils/format';

const LABEL = { online: 'online', offline: 'offline' } as const;

/**
 * Moves funds between the user's own wallets (Transfer to Online / Offline). `busy` covers the whole
 * sign-prepare-submit-confirm run, which takes several seconds, so the screen can lock the form.
 */
type Outcome = Pick<ResultDialogProps, 'mood' | 'title' | 'message' | 'buttonLabel'> & { done: boolean };

export function useWalletTransfer(to: 'online' | 'offline', onDone: () => void) {
  const { activeAccount } = useAuth();
  const { refresh, addLocalActivity } = useWalletData();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const transfer = useCallback(
    async (amount: number) => {
      if (!activeAccount || running.current) return;
      running.current = true;
      setBusy(true);
      // Deriving the key is CPU work; let "Transferring…" draw first.
      await afterNextPaint();
      try {
        const hash = await (to === 'online' ? moveToOnline : moveToOffline)(activeAccount.stellarPublicKey, amount);
        // Listed right away from this phone; the server records it too (confirmed in the background) and its copy
        // replaces this one on the next refresh, which is also what shows it on other devices.
        addLocalActivity(buildMoveEntries(to, amount, hash));
        void refresh({ force: true });
        successHaptic();
        const t = messages();
        setOutcome({
          mood: 'success',
          title: t.transfer.successTitle,
          message: t.transfer.successBody(formatPeso(amount), LABEL[to]),
          buttonLabel: t.common.done,
          done: true,
        });
      } catch (error) {
        if (error instanceof PendingTransactionError) {
          addLocalActivity(buildMoveEntries(to, amount, error.hash, 'pending'));
          void refresh({ force: true });
          const t = messages();
          setOutcome({ mood: 'idlePlain', title: t.common.pendingConfirmation, message: t.common.pendingConfirmationBody, buttonLabel: t.common.done, done: true });
          return;
        }
        if (!(error instanceof UserFacingError)) reportError(error, { step: `transferTo${to}` });
        errorHaptic();
        const t = messages();
        setOutcome({ mood: 'fail', title: t.transfer.failTitle, message: errorMessage(error), buttonLabel: t.common.tryAgain, done: false });
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [activeAccount, to, refresh, addLocalActivity, onDone],
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

  return { busy, transfer, dialog };
}
