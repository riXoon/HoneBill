import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useWalletData } from '../../context/WalletDataContext';
import { useT } from '../../i18n';
import type { RootStackParamList } from '../../navigation/types';
import {
  clearUnansweredDispatch,
  loadUnansweredDispatch,
  onDispatchChange,
  pendingPayment,
  type UnansweredDispatch,
} from '../../services/offline/smsDispatch';
import { rememberRecipient } from '../../services/recipientDirectory';
import { formatPeso } from '../../utils/format';

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
 * Asks "Did you send the text?" for an offline payment texted from this phone, whenever the person comes back to the
 * app signed in: straight back from the messaging app, after the auto-lock and their MPIN, or after the phone closed
 * HoneBill. Lives above the screens so a lock or restart can never lose the question (see `smsDispatch.ts`).
 */
export function SmsDispatchPrompt({ navigation }: { navigation: NavigationContainerRefWithCurrent<RootStackParamList> }) {
  const t = useT();
  const { activeAccount } = useAuth();
  const { addPendingOffline, status } = useWalletData();
  const publicKey = activeAccount?.stellarPublicKey ?? null;
  // The wallet's saved pending payments must be loaded first, or a "yes" could be added before them and replace them.
  const walletLoaded = publicKey !== null && status !== 'idle';
  const [question, setQuestion] = useState<UnansweredDispatch | null>(null);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (!publicKey || !walletLoaded || checking.current) return;
    checking.current = true;
    try {
      const found = await loadUnansweredDispatch(publicKey);
      const route = navigation.isReady() ? navigation.getCurrentRoute()?.name : undefined;
      // Locking happens on the same return to the app: never ask over (or just before) the MPIN screen.
      if (!found || !route || SIGNED_OUT_ROUTES.has(route as keyof RootStackParamList)) return;
      if (found.recipient) rememberRecipient(found.recipient);
      setQuestion((current) => current ?? found);
    } finally {
      checking.current = false;
    }
  }, [publicKey, walletLoaded, navigation]);

  // Signed out (locked or another account): nothing of this wallet stays on screen.
  useEffect(() => {
    if (!publicKey) setQuestion(null);
  }, [publicKey]);

  useEffect(() => {
    void check();
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    // After the MPIN the app moves on to Home: ask once it is there.
    const navUnsub = navigation.addListener('state', () => void check());
    const unsubscribe = onDispatchChange(() => void check());
    return () => {
      appSub.remove();
      navUnsub();
      unsubscribe();
    };
  }, [check, navigation]);

  if (!question || question.publicKey !== publicKey) return null;

  const { draft, recipient, nonce, voucher, openedAt } = question;
  const who = recipient ? (recipient.unverified ? `ID ${recipient.shortId}` : recipient.name) : null;

  return (
    <ConfirmDialog
      visible
      mood="phone"
      title={t.sendMethod.sentTitle}
      message={`${who ? t.sendMethod.sentFor(formatPeso(draft.amount), who) : ''}${t.sendMethod.sentBody}`}
      confirmLabel={t.sendMethod.sentYes}
      cancelLabel={t.sendMethod.sentNo}
      onConfirm={() => {
        setQuestion(null);
        // Holds the money and queues the voucher (both keyed by nonce, so a repeat changes nothing).
        addPendingOffline(pendingPayment(nonce, draft.amount, recipient, openedAt), voucher);
        void clearUnansweredDispatch(question.publicKey, nonce);
        if (navigation.isReady()) {
          navigation.navigate('SendReceipt', { ...draft, method: 'sms', reference: nonce, issuedAt: openedAt });
        }
      }}
      onCancel={() => {
        // Not sent. If the Send screen is still open, it keeps the same voucher, so texting again never pays twice.
        setQuestion(null);
        void clearUnansweredDispatch(question.publicKey, nonce);
      }}
    />
  );
}
