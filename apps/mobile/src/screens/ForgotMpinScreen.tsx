import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/ui/Button';
import { CodeBoxes } from '../components/ui/CodeBoxes';
import { Notice } from '../components/ui/Notice';
import { ProcessingOverlay } from '../components/ui/ProcessingOverlay';
import { SettingsPage } from '../components/ui/SettingsPage';
import { SmsCodeStep } from '../components/ui/SmsCodeStep';
import { WeakPinDialog } from '../components/ui/WeakPinDialog';
import { MPIN_LENGTH } from '../config/limits';
import { useIsOnline } from '../hooks/useIsOnline';
import type { RootStackParamList } from '../navigation/types';
import { formatPhoneDisplay } from '../services/accountPhone';
import { needsSmsCode, resetPin } from '../services/api/auth';
import { ApiError, UserFacingError, errorMessage, isAborted } from '../services/api/client';
import { sendOtp } from '../services/api/otp';
import { lookupUserByPhone } from '../services/api/users';
import { fieldErrorText } from '../services/completeSignup';
import { reportError } from '../services/errorReporting';
import { weakMpinReason, type WeakMpinReason } from '../services/mpinPolicy';
import { clearSession, getSessionToken } from '../services/session';
import { getDevicePublicKey } from '../services/wallet/deviceWallet';
import { openWalletSigner } from '../services/wallet/signer';
import { colors, fonts } from '../theme';

/**
 * Forgot MPIN. Two things prove it is the account owner, instead of the MPIN they cannot remember:
 *   1. a code texted to the account's number (`sms`);
 *   2. this phone holding the account's wallet, shown by signing the server's sign-in challenge with it (done silently
 *      when saving). On a phone that does not hold the wallet (`nowallet`) the person first restores it with the
 *      recovery phrase, through the existing recovery flow, then comes back here.
 * Then they choose a new MPIN twice. Saving signs out to the sign-in screen, which asks for the new MPIN.
 */
type Step = 'checking' | 'blocked' | 'nowallet' | 'sms' | 'new' | 'confirm' | 'saving';

const COPY = {
  new: { subtitle: 'Choose a new 4-digit MPIN.', label: 'New 4-digit MPIN' },
  confirm: { subtitle: 'Enter the new MPIN once more to confirm.', label: 'Confirm new 4-digit MPIN' },
} as const;

export function ForgotMpinScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'ForgotMpin'>) {
  const { phone } = route.params;
  const connected = useIsOnline();
  const [step, setStep] = useState<Step>('checking');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blockedText, setBlockedText] = useState('');
  const [busy, setBusy] = useState(false);
  const [weak, setWeak] = useState<WeakMpinReason | null>(null);
  // Remounting the boxes after a step or a dialog brings the keyboard back and clears them.
  const [round, setRound] = useState(0);
  const walletKey = useRef('');
  const smsProof = useRef<string | undefined>(undefined);
  const chosen = useRef('');
  const request = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      request.current?.abort();
      // The new MPIN and the SMS proof live only in these refs; drop them with the screen.
      chosen.current = '';
      smsProof.current = undefined;
    },
    [],
  );

  const goTo = (next: Step, message: string | null = null) => {
    setStep(next);
    setPin('');
    setError(message);
    setRound((n) => n + 1);
  };

  const block = (text: string) => {
    chosen.current = '';
    smsProof.current = undefined;
    setBlockedText(text);
    goTo('blocked');
  };

  // Find the account for this number and whether this phone holds its wallet. Needs the internet.
  useEffect(() => {
    if (!connected) {
      block("You're offline. Connect to the internet to reset your MPIN.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    void (async () => {
      try {
        const account = await lookupUserByPhone(phone, controller.signal);
        if (!account) {
          block('No account was found for this number.');
          return;
        }
        walletKey.current = account.stellarPublicKey;
        let held = false;
        try {
          held = (await getDevicePublicKey()) === account.stellarPublicKey;
        } catch {
          held = false;
        }
        goTo(held ? 'sms' : 'nowallet');
      } catch (e) {
        if (!isAborted(e)) block(errorMessage(e));
      }
    })();
    return () => controller.abort();
    // Runs once, on arrival: the screen's own steps take it from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** This phone has no wallet for the account: restore it from the recovery phrase (existing flow), then come back. */
  const restoreWallet = async () => {
    if (busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      await sendOtp(phone, controller.signal);
      navigation.navigate('Otp', { phone, purpose: 'recover' });
    } catch (e) {
      if (!isAborted(e)) setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const controller = new AbortController();
    request.current = controller;
    setStep('saving');
    try {
      // The wallet signs the server's challenge: proof that this phone holds the account's wallet.
      const signer = await openWalletSigner(walletKey.current);
      const sessionToken = await getSessionToken(signer, controller.signal);
      await resetPin(phone, chosen.current, smsProof.current, sessionToken, controller.signal);
      chosen.current = '';
      smsProof.current = undefined;
      // The session was only for this reset; the person signs in again with the new MPIN.
      clearSession();
      navigation.reset({ index: 0, routes: [{ name: 'Login', params: { reason: 'pinChanged' } }] });
    } catch (e) {
      if (isAborted(e)) return;
      if (needsSmsCode(e)) {
        // The code's proof expired (30 minutes) while the new MPIN was being chosen: verify the number again.
        smsProof.current = undefined;
        goTo('sms', 'Your code expired. We sent a new one.');
      } else if (e instanceof ApiError && e.status === 403) {
        goTo('nowallet');
      } else if (e instanceof ApiError && e.status === 400) {
        goTo('new', fieldErrorText(e) ?? errorMessage(e));
      } else if (e instanceof UserFacingError) {
        // The wallet on this phone is missing or is not this account's.
        goTo('nowallet');
      } else {
        reportError(e, { step: 'resetPin' });
        goTo('confirm', errorMessage(e));
      }
    }
  };

  const submit = (value: string) => {
    if (value.length !== MPIN_LENGTH || busy) return;
    if (step === 'new') {
      const reason = weakMpinReason(value);
      if (reason) {
        setWeak(reason);
        return;
      }
      chosen.current = value;
      goTo('confirm');
      return;
    }
    if (step === 'confirm') {
      if (value !== chosen.current) {
        chosen.current = '';
        goTo('new', 'The two MPINs did not match. Choose your new MPIN again.');
        return;
      }
      void save();
    }
  };

  const onChange = (value: string) => {
    setPin(value);
    if (value.length === MPIN_LENGTH) submit(value);
  };

  const processing = step === 'saving' ? { title: 'Resetting your MPIN' } : null;

  let body;
  let subtitle: string;
  if (step === 'checking') {
    subtitle = 'Checking your account…';
    body = (
      <Text style={styles.status} accessibilityLiveRegion="polite">
        One moment…
      </Text>
    );
  } else if (step === 'blocked') {
    subtitle = 'Your MPIN was not reset.';
    body = (
      <>
        <Notice tone="warning" title="We couldn't continue">
          {blockedText}
        </Notice>
        <Button label="Back to sign in" size="large" onPress={navigation.goBack} />
      </>
    );
  } else if (step === 'nowallet') {
    subtitle = "This phone doesn't hold your wallet yet.";
    body = (
      <>
        <Notice tone="warning" title="Restore your wallet first">
          To keep your money safe, an MPIN can only be reset from a phone that holds your wallet. Restore it with your
          12-word recovery phrase, then tap "Forgot MPIN?" again.
        </Notice>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button label={busy ? 'Please wait…' : 'Restore my wallet'} size="large" onPress={() => void restoreWallet()} disabled={busy} />
      </>
    );
  } else if (step === 'sms') {
    subtitle = 'Confirm it\'s you with the code we text to your number.';
    body = (
      <>
        {error ? <Notice tone="info">{error}</Notice> : null}
        <SmsCodeStep
          key={round}
          phone={phone}
          onVerified={(proof) => {
            smsProof.current = proof;
            goTo('new');
          }}
        />
      </>
    );
  } else {
    subtitle = COPY[step === 'saving' ? 'confirm' : step].subtitle;
    body = (
      <>
        {step === 'new' ? (
          <Notice tone="info">
            You'll sign in with this new MPIN. For your security, your email can't be changed for 24 hours after an
            MPIN reset.
          </Notice>
        ) : null}
        <View style={styles.codeBlock}>
          <CodeBoxes
            key={round}
            length={MPIN_LENGTH}
            value={pin}
            onChange={onChange}
            secure
            autoFocus
            accessibilityLabel={COPY[step === 'saving' ? 'confirm' : step].label}
          />
          <Text
            style={[styles.status, error ? styles.error : null]}
            accessibilityLiveRegion="polite"
            accessibilityRole={error ? 'alert' : undefined}
          >
            {error ?? ' '}
          </Text>
        </View>
      </>
    );
  }

  return (
    <View style={styles.root}>
      <SettingsPage title="Forgot MPIN" subtitle={`${subtitle} (${formatPhoneDisplay(phone)})`} onBack={navigation.goBack}>
        {body}
        <WeakPinDialog
          reason={weak}
          onDismiss={() => {
            setWeak(null);
            goTo('new');
          }}
        />
      </SettingsPage>
      {/* Covers the screen and blocks Back while the reset is being saved. */}
      <ProcessingOverlay processing={processing} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  codeBlock: { gap: 12, alignItems: 'center' },
  status: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  error: { color: colors.coral },
});
