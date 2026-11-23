import { useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

import { ConfirmDialog } from '../ui/ConfirmDialog';
import { OFFLINE_TOLL_PESOS } from '../../config/limits';
import { useAuth } from '../../context/AuthContext';
import { useWalletData } from '../../context/WalletDataContext';
import { useIsOnline } from '../../hooks/useIsOnline';
import { useT } from '../../i18n';
import type { RootStackParamList } from '../../navigation/types';
import {
  clearSmsHandoff,
  loadSmsHandoff,
  onDispatchChange,
  pendingPayment,
  type SmsHandoff,
} from '../../services/offline/smsDispatch';
import { rememberRecipient, resolveRecipient } from '../../services/recipientDirectory';
import type { Recipient } from '../../types/recipient';
import { formatPeso, voucherRef } from '../../utils/format';

/** Screens shown before sign-in. The question waits until the person is past them. */
const SIGNED_OUT_ROUTES = new Set<keyof RootStackParamList>([
  'Landing',
  'Login',
  'ForgotMpin',
  'InputNumber',
  'Terms',
  'Otp',
  'VerifySeedPhrase',
  'UserDetails',
  'MpinCreation',
  'RecoveryPhrase',
  'RecoveryQuiz',
  'AccountConfirmation',
]);

/**
 * Asks about SMS dispatch when the user returns, including after an auto-lock or restart.
 * A separate prompt asks for approval to retry an eligible unconfirmed transfer online.
 */
export function SmsDispatchPrompt({ navigation }: { navigation: NavigationContainerRefWithCurrent<RootStackParamList> }) {
  const t = useT();
  const { activeAccount } = useAuth();
  const { answerVoucherReview, trackOfflineDispatch, voucherReviews, status } = useWalletData();
  const online = useIsOnline();
  const publicKey = activeAccount?.stellarPublicKey ?? null;
  // Load saved holds before recording the dispatch.
  const walletLoaded = publicKey !== null && status !== 'idle';
  const [foreground, setForeground] = useState<{ publicKey: string; handoff: SmsHandoff | null } | null>(null);
  const [resolved, setResolved] = useState<Recipient | null>(null);

  useEffect(() => {
    if (!publicKey || !walletLoaded) return;
    let generation = 0;
    const check = async () => {
      const started = ++generation;
      if (AppState.currentState !== 'active') {
        setForeground(null);
        return;
      }
      const found = await loadSmsHandoff(publicKey);
      if (started !== generation) return;
      const route = navigation.isReady() ? navigation.getCurrentRoute()?.name : undefined;
      if (!route || SIGNED_OUT_ROUTES.has(route as keyof RootStackParamList)) {
        setForeground(null);
        return;
      }
      setForeground({ publicKey, handoff: found });
    };
    void check();
    const appSub = AppState.addEventListener('change', () => void check());
    const navUnsub = navigation.addListener('state', () => void check());
    const unsubscribe = onDispatchChange(() => void check());
    return () => {
      generation++;
      appSub.remove();
      navUnsub();
      unsubscribe();
    };
  }, [publicKey, walletLoaded, navigation]);

  const canPrompt = walletLoaded && foreground?.publicKey === publicKey;
  const handoff = canPrompt ? foreground.handoff : null;
  const review = canPrompt && !handoff && online
    ? voucherReviews.find(({ row }) => row.publicKey === publicKey)
    : undefined;
  const receiverShortId = review?.receiverShortId;

  useEffect(() => {
    setResolved(null);
    if (!review || !receiverShortId) return;
    const controller = new AbortController();
    void resolveRecipient(receiverShortId, controller.signal)
      .then((recipient) => {
        if (controller.signal.aborted) return;
        if (recipient) setResolved(recipient);
        else answerVoucherReview(review, null);
      })
      .catch(() => {
        // A failed lookup leaves the voucher untouched. The next wallet refresh checks it again.
      });
    return () => controller.abort();
  }, [review, receiverShortId, answerVoucherReview]);

  if (handoff) {
    const { draft, nonce, openedAt, recipient, voucher } = handoff;
    const who = recipient ? (recipient.unverified ? `ID ${recipient.shortId}` : recipient.name) : draft.recipientId;
    const answer = (sent: boolean) => {
      // Either answer preserves the voucher for status checks. Only the retry dialog can authorize submission.
      const payment = pendingPayment(nonce, draft.amount, recipient, openedAt);
      if (!trackOfflineDispatch(payment, voucher)) {
        Alert.alert(t.sendMethod.reviewSaveFailed);
        return;
      }
      void clearSmsHandoff(handoff.publicKey, nonce);
      setForeground({ publicKey: handoff.publicKey, handoff: null });
      if (sent && navigation.isReady()) {
        if (recipient) rememberRecipient(recipient);
        navigation.navigate('SendReceipt', { ...draft, method: 'sms', reference: nonce, issuedAt: openedAt });
      }
    };
    return (
      <ConfirmDialog
        visible
        mood="phone"
        title={t.sendMethod.sentTitle}
        message={t.sendMethod.sentBody(formatPeso(draft.amount), who)}
        confirmLabel={t.sendMethod.sentYes}
        cancelLabel={t.sendMethod.sentNo}
        onConfirm={() => answer(true)}
        onCancel={() => answer(false)}
      />
    );
  }

  if (review && resolved && resolved.shortId === receiverShortId) {
    const answer = (approve: boolean) => {
      const payment = approve ? pendingPayment(review.nonce, review.amount, resolved, review.dispatchedAt) : null;
      if (!answerVoucherReview(review, payment)) {
        Alert.alert(t.sendMethod.reviewSaveFailed);
      }
    };
    return (
      <ConfirmDialog
        visible
        mood="phone"
        title={t.sendMethod.recoveryTitle}
        message={t.sendMethod.recoveryBody(
          formatPeso(review.amount),
          resolved.name,
          voucherRef(review.nonce),
          formatPeso(review.amount + OFFLINE_TOLL_PESOS),
        )}
        confirmLabel={t.sendMethod.settleOnline}
        cancelLabel={t.sendMethod.recoveryLater}
        onConfirm={() => answer(true)}
        onCancel={() => answer(false)}
      />
    );
  }

  return null;
}
