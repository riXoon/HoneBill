import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/ui/Button';
import { Notice } from '../components/ui/Notice';
import { PinDialog } from '../components/ui/PinDialog';
import { SettingsPage } from '../components/ui/SettingsPage';
import { SmsCodeStep } from '../components/ui/SmsCodeStep';
import { TextField } from '../components/ui/TextField';
import { fullName, useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { formatPhoneDisplay } from '../services/accountPhone';
import { getChangeAvailability, isChangeCooldown, needsSmsCode } from '../services/api/auth';
import { ApiError, errorMessage, isAborted } from '../services/api/client';
import { updateProfile } from '../services/api/users';
import { fieldErrorText } from '../services/completeSignup';
import { pinErrorMessage } from '../services/pinErrors';
import { colors, fonts } from '../theme';
import { formatWait } from '../utils/format';

const REQUIRED = 'Input is required';
const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_TAKEN = 'This email is already used by another account.';

/** The form, then (after the MPIN and the 24-hour check) the SMS code; saving happens once the code checks out. */
type Step = 'form' | 'sms' | 'saving';
type Message = { tone: 'warning' | 'error'; title: string; text: string };

export function AccountSettingsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'AccountSettings'>) {
  const { activeAccount } = useAuth();
  // The server never sends the email back, so the field starts empty.
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [askPin, setAskPin] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [smsRound, setSmsRound] = useState(0);
  const pendingEmail = useRef('');
  const pin = useRef('');
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      request.current?.abort();
      pin.current = '';
    },
    [],
  );

  const phone = activeAccount?.phone ?? null;

  const backToForm = (next: Message | null) => {
    pin.current = '';
    setMessage(next);
    setStep('form');
  };

  const review = () => {
    setSaved(false);
    setMessage(null);
    const mail = email.trim();
    if (!mail) {
      setEmailError(REQUIRED);
      return;
    }
    if (mail.length > EMAIL_MAX || !EMAIL_PATTERN.test(mail)) {
      setEmailError('Enter a valid email address');
      return;
    }
    setEmailError(undefined);
    pendingEmail.current = mail;
    setAskPin(true);
  };

  /** After the MPIN: is a change allowed now, and is the address free? Only then is an SMS sent. */
  const checkPin = async (value: string): Promise<string | null> => {
    if (!phone) return 'This account has no phone number on this device.';
    let availability;
    try {
      availability = await getChangeAvailability(phone, value, pendingEmail.current);
    } catch (e) {
      return pinErrorMessage(e);
    }
    setAskPin(false);
    if (availability.email.retryAfter > 0) {
      setMessage({
        tone: 'warning',
        title: 'Please try again later',
        text:
          availability.email.reason === 'reset'
            ? `For your security, your email can't be changed for ${formatWait(availability.email.retryAfter)} after an MPIN reset.`
            : `You changed your email recently. You can change it again in ${formatWait(availability.email.retryAfter)}.`,
      });
      return null;
    }
    if (availability.emailTaken) {
      setEmailError(EMAIL_TAKEN);
      return null;
    }
    pin.current = value;
    setSmsRound((n) => n + 1);
    setStep('sms');
    return null;
  };

  const save = async (proof: string | undefined) => {
    if (!phone) return;
    const controller = new AbortController();
    request.current = controller;
    setStep('saving');
    try {
      await updateProfile(phone, pin.current, { email: pendingEmail.current }, proof, controller.signal);
    } catch (e) {
      if (isAborted(e) || !mounted.current) return;
      if (e instanceof ApiError && e.status === 409) {
        setEmailError(fieldErrorText(e) ?? EMAIL_TAKEN);
        backToForm(null);
      } else if (isChangeCooldown(e)) {
        backToForm({ tone: 'warning', title: 'Please try again later', text: errorMessage(e) });
      } else if (needsSmsCode(e)) {
        setSmsRound((n) => n + 1);
        setStep('sms');
      } else if (e instanceof ApiError && e.status === 400) {
        setEmailError(fieldErrorText(e) ?? errorMessage(e));
        backToForm(null);
      } else {
        backToForm({ tone: 'error', title: 'Your email was not saved', text: pinErrorMessage(e) });
      }
      return;
    }
    if (!mounted.current) return;
    setEmail('');
    setSaved(true);
    backToForm(null);
  };

  if (step !== 'form' && phone) {
    return (
      <SettingsPage title="Account Settings" subtitle="Confirm it's you with the code we text to your number." onBack={() => backToForm(null)}>
        {step === 'saving' ? (
          <Text style={styles.saving} accessibilityLiveRegion="polite">
            Saving your email…
          </Text>
        ) : (
          <SmsCodeStep key={smsRound} phone={phone} onVerified={(proof) => void save(proof)} />
        )}
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Account Settings" subtitle="You can update the email on your account." onBack={navigation.goBack}>
      <Notice tone="info">
        For your security, we'll text a code to your number to confirm, and you can change your email once every 24 hours.
      </Notice>
      <View style={styles.form}>
        <TextField
          label="New email address"
          placeholder="name@example.com"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setSaved(false);
            setEmailError(undefined);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          error={emailError}
        />

        <View style={styles.facts}>
          <Fact label="Name" value={fullName(activeAccount)} />
          <Fact label="Mobile number" value={phone ? formatPhoneDisplay(phone) : 'Not available'} />
          <Fact label="Short ID" value={activeAccount?.shortId ?? ''} />
          <Text style={styles.note}>Your name, number and Short ID cannot be changed here.</Text>
        </View>
      </View>

      {message ? (
        <Notice tone={message.tone} title={message.title}>
          {message.text}
        </Notice>
      ) : null}
      {saved ? (
        <Text style={styles.success} accessibilityLiveRegion="polite">
          Saved! Your email is updated.
        </Text>
      ) : null}
      <Button label="Save email" size="large" onPress={review} />

      <PinDialog
        visible={askPin}
        title="Confirm with your MPIN"
        message="Enter your 4-digit MPIN. We'll then text a code to your number."
        onSubmit={checkPin}
        onCancel={() => setAskPin(false)}
      />
    </SettingsPage>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 4 },
  facts: { marginTop: 8, gap: 10 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  factLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },
  factValue: { flexShrink: 1, textAlign: 'right', fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  note: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  success: { fontFamily: fonts.medium, fontSize: 15, color: colors.success, textAlign: 'center' },
  saving: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted, textAlign: 'center' },
});
