import { useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';

import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useWalletData } from '../../context/WalletDataContext';
import { useT } from '../../i18n';
import type { RootStackParamList } from '../../navigation/types';
import {
  clearSmsHandoff,
  loadSmsHandoff,
  onDispatchChange,
  pendingPayment,
  type SmsHandoff,
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
 * Asks about SMS dispatch when the user returns, including after an auto-lock or restart.
 */
export function SmsDispatchPrompt({ navigation }: { navigation: NavigationContainerRefWithCurrent<RootStackParamList> }) {
  const t = useT();
  const { activeAccount } = useAuth();
  const { trackOfflineDispatch, status } = useWalletData();
  const publicKey = activeAccount?.stellarPublicKey ?? null;
  // Load saved holds before recording the dispatch.
  const walletLoaded = publicKey !== null && status !== 'idle';
  const [foreground, setForeground] = useState<{ publicKey: string; handoff: SmsHandoff | null } | null>(null);

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

  if (handoff) {
    const { draft, nonce, openedAt, recipient, feeCents, assetCode } = handoff;
    const who = recipient ? (recipient.unverified ? `ID ${recipient.shortId}` : recipient.name) : draft.recipientId;
    const answer = (sent: boolean) => {
      // A draft may still be sent later, so either answer keeps its reference for status checks.
      const payment = pendingPayment(nonce, draft.amount, recipient, openedAt, feeCents, assetCode);
      if (!trackOfflineDispatch(payment)) {
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

  return null;
}
