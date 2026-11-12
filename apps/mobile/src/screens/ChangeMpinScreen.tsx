import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/ui/Button';
import { CodeBoxes } from '../components/ui/CodeBoxes';
import { SettingsPage } from '../components/ui/SettingsPage';
import { WeakPinDialog } from '../components/ui/WeakPinDialog';
import { MPIN_LENGTH } from '../config/limits';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { changePin, verifyPin } from '../services/api/auth';
import { ApiError, errorMessage, isAborted } from '../services/api/client';
import { fieldErrorText } from '../services/completeSignup';
import { weakMpinReason, type WeakMpinReason } from '../services/mpinPolicy';
import { pinErrorMessage } from '../services/pinErrors';
import { colors, fonts } from '../theme';

type Step = 'current' | 'new' | 'confirm' | 'done';

const COPY: Record<Exclude<Step, 'done'>, { subtitle: string; label: string }> = {
  current: { subtitle: 'First, enter your current 4-digit MPIN.', label: 'Current 4-digit MPIN' },
  new: { subtitle: 'Now choose a new 4-digit MPIN.', label: 'New 4-digit MPIN' },
  confirm: { subtitle: 'Enter the new MPIN once more to confirm.', label: 'Confirm new 4-digit MPIN' },
};

export function ChangeMpinScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'ChangeMpin'>) {
  const { activeAccount } = useAuth();
  const phone = activeAccount?.phone ?? null;
  const [step, setStep] = useState<Step>('current');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [weak, setWeak] = useState<WeakMpinReason | null>(null);
  // Remounting the boxes after a step or a dialog brings the keyboard back and clears them.
  const [round, setRound] = useState(0);
  const current = useRef('');
  const chosen = useRef('');
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      // The PINs live only in these refs; drop them with the screen.
      current.current = '';
      chosen.current = '';
    },
    [],
  );

  const goTo = (next: Step, message: string | null = null) => {
    setStep(next);
    setPin('');
    setError(message);
    setRound((n) => n + 1);
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
        await verifyPin(phone, value, controller.signal);
        current.current = value;
        goTo('new');
      } else {
        await changePin(phone, current.current, chosen.current, controller.signal);
        current.current = '';
        chosen.current = '';
        goTo('done');
      }
    } catch (e) {
      if (isAborted(e)) return;
      if (step === 'confirm' && e instanceof ApiError && e.status === 400) {
        goTo('new', fieldErrorText(e) ?? errorMessage(e));
      } else if (step === 'confirm' && e instanceof ApiError && (e.status === 401 || e.status === 423)) {
        // The current PIN no longer checks out (or the phone is locked): start again from the top.
        current.current = '';
        chosen.current = '';
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

  if (step === 'done') {
    return (
      <SettingsPage title="MPIN changed" subtitle="Use your new MPIN the next time you sign in." onBack={navigation.goBack}>
        <Button label="Done" size="large" onPress={navigation.goBack} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Change MPIN" subtitle={COPY[step].subtitle} onBack={navigation.goBack}>
      <View style={styles.codeBlock}>
        <CodeBoxes key={round} length={MPIN_LENGTH} value={pin} onChange={onChange} secure autoFocus accessibilityLabel={COPY[step].label} />
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
  status: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  error: { color: colors.coral },
});
