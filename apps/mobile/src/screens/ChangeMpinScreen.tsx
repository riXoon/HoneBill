import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/ui/Button';
import { CodeBoxes } from '../components/ui/CodeBoxes';
import { Notice } from '../components/ui/Notice';
import { SettingsPage } from '../components/ui/SettingsPage';
import { SmsCodeStep } from '../components/ui/SmsCodeStep';
import { WeakPinDialog } from '../components/ui/WeakPinDialog';
import { MPIN_LENGTH } from '../config/limits';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { changePin, getChangeAvailability, isChangeCooldown, needsSmsCode } from '../services/api/auth';
import { ApiError, errorMessage, isAborted } from '../services/api/client';
import { fieldErrorText } from '../services/completeSignup';
import { weakMpinReason, type WeakMpinReason } from '../services/mpinPolicy';
import { forgetMpin, rememberMpin } from '../services/offlineMpin';
import { pinErrorMessage } from '../services/pinErrors';
import { colors, fonts } from '../theme';
import { formatWait } from '../utils/format';

/**
 * current → (24-hour check) → sms → new → confirm. A refused change ends on `blocked` with the reason; a finished one
 * signs the person out to the sign-in screen, so the new MPIN is used straight away.
 */
type Step = 'current' | 'sms' | 'new' | 'confirm' | 'blocked';
type PinStep = Exclude<Step, 'sms' | 'blocked'>;

const COPY: Record<PinStep, { subtitle: string; label: string }> = {
  current: { subtitle: 'First, enter your current 4-digit MPIN.', label: 'Current 4-digit MPIN' },
  new: { subtitle: 'Now choose a new 4-digit MPIN.', label: 'New 4-digit MPIN' },
  confirm: { subtitle: 'Enter the new MPIN once more to confirm.', label: 'Confirm new 4-digit MPIN' },
};

export function ChangeMpinScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'ChangeMpin'>) {
  const { activeAccount, logout } = useAuth();
  const phone = activeAccount?.phone ?? null;
  const [step, setStep] = useState<Step>('current');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [weak, setWeak] = useState<WeakMpinReason | null>(null);
  // Remounting the boxes after a step or a dialog brings the keyboard back and clears them.
  const [round, setRound] = useState(0);
  const current = useRef('');
  const chosen = useRef('');
  const smsProof = useRef<string | undefined>(undefined);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      // The PINs and the SMS proof live only in these refs; drop them with the screen.
      current.current = '';
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

  const block = (reason: string) => {
    current.current = '';
    chosen.current = '';
    smsProof.current = undefined;
    setBlockedReason(reason);
    goTo('blocked');
  };

  /** The new MPIN is saved: sign out and go to the sign-in screen, where it is used for the first time. */
  const finish = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Login', params: { reason: 'pinChanged' } }] });
  };

  const submit = async (value: string) => {
    if (busy || value.length !== MPIN_LENGTH) return;
    if (!phone) {
      setError('This account has no phone number on this device.');
      return;
    }

    if (step === 'new') {
      const reason = weakMpinReason(value);
      if (reason) {
        setWeak(reason);
        return;
      }
      if (value === current.current) {
        goTo('new', 'Your new MPIN must be different from the current one.');
        return;
      }
      chosen.current = value;
      goTo('confirm');
      return;
    }

    if (step === 'confirm' && value !== chosen.current) {
      chosen.current = '';
      goTo('new', 'The two MPINs did not match. Choose your new MPIN again.');
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      if (step === 'current') {
        // Checks the PIN and the 24-hour rule together, before an SMS is sent or a new MPIN is typed.
        const availability = await getChangeAvailability(phone, value, undefined, controller.signal);
        if (availability.pin.retryAfter > 0) {
          block(`You changed your MPIN recently. You can change it again in ${formatWait(availability.pin.retryAfter)}.`);
          return;
        }
        current.current = value;
        // The server just accepted the current MPIN: keep it for offline sign-in in case the change is abandoned.
        if (activeAccount) void rememberMpin(phone, activeAccount.stellarPublicKey, value);
        goTo('sms');
      } else {
        await changePin(phone, current.current, chosen.current, smsProof.current, controller.signal);
        // The old MPIN must stop working offline too: save the new one in its place.
        if (activeAccount) await rememberMpin(phone, activeAccount.stellarPublicKey, chosen.current);
        else await forgetMpin();
        current.current = '';
        chosen.current = '';
        smsProof.current = undefined;
        await finish();
      }
    } catch (e) {
      if (isAborted(e)) return;
      if (isChangeCooldown(e)) {
        block(errorMessage(e));
      } else if (needsSmsCode(e)) {
        // The code's proof expired (30 minutes) while the new MPIN was being chosen: verify the number again.
        smsProof.current = undefined;
        goTo('sms', 'Your code expired. We sent a new one.');
      } else if (step === 'confirm' && e instanceof ApiError && e.status === 400) {
        goTo('new', fieldErrorText(e) ?? errorMessage(e));
      } else if (step === 'confirm' && e instanceof ApiError && (e.status === 401 || e.status === 423)) {
        // The current PIN no longer checks out (or the phone is locked): start again from the top.
        current.current = '';
        chosen.current = '';
        smsProof.current = undefined;
        goTo('current', pinErrorMessage(e));
      } else {
        goTo(step, pinErrorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const onChange = (value: string) => {
    setPin(value);
    if (value.length === MPIN_LENGTH) void submit(value);
  };

  if (step === 'blocked') {
    return (
      <SettingsPage title="Change MPIN" subtitle="Your MPIN was not changed." onBack={navigation.goBack}>
        <Notice tone="warning" title="Please try again later">
          {blockedReason}
        </Notice>
        <Button label="Back to settings" size="large" onPress={navigation.goBack} />
      </SettingsPage>
    );
  }

  if (step === 'sms' && phone) {
    return (
      <SettingsPage title="Change MPIN" subtitle="Confirm it's you with the code we text to your number." onBack={navigation.goBack}>
        {error ? <Notice tone="info">{error}</Notice> : null}
        <SmsCodeStep
          key={round}
          phone={phone}
          onVerified={(proof) => {
            smsProof.current = proof;
            goTo('new');
          }}
        />
      </SettingsPage>
    );
  }

  const pinStep: PinStep = step === 'sms' ? 'current' : step;
  return (
    <SettingsPage title="Change MPIN" subtitle={COPY[pinStep].subtitle} onBack={navigation.goBack}>
      {pinStep === 'current' ? (
        <Notice tone="info">
          For your security, we'll text a code to your number to confirm, and you can change your MPIN once every 24
          hours. You'll sign in again with the new MPIN.
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
          accessibilityLabel={COPY[pinStep].label}
        />
        <Text
          style={[styles.status, error ? styles.error : null]}
          accessibilityLiveRegion="polite"
          accessibilityRole={error ? 'alert' : undefined}
        >
          {busy ? 'Checking…' : (error ?? ' ')}
        </Text>
      </View>
      <WeakPinDialog
        reason={weak}
        onDismiss={() => {
          setWeak(null);
          goTo('new');
        }}
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  codeBlock: { gap: 12, alignItems: 'center' },
  status: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  error: { color: colors.coral },
});
