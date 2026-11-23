import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/ui/Button';
import { LanguageSwitch } from '../components/ui/LanguageSwitch';
import { Notice } from '../components/ui/Notice';
import { PinDialog } from '../components/ui/PinDialog';
import { SettingsPage } from '../components/ui/SettingsPage';
import { SmsCodeStep } from '../components/ui/SmsCodeStep';
import { TextField } from '../components/ui/TextField';
import { fullName, useAuth } from '../context/AuthContext';
import { messages, useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { formatPhoneDisplay } from '../services/accountPhone';
import { getChangeAvailability, isChangeCooldown, needsSmsCode } from '../services/api/auth';
import { ApiError, errorMessage, isAborted } from '../services/api/client';
import { updateProfile } from '../services/api/users';
import { fieldErrorText } from '../services/completeSignup';
import { pinErrorMessage } from '../services/pinErrors';
import { colors, fonts } from '../theme';
import { formatWait } from '../utils/format';

const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The form, then (after the MPIN and the 24-hour check) the SMS code; saving happens once the code checks out. */
type Step = 'form' | 'sms' | 'saving';
type Message = { tone: 'warning' | 'error'; title: string; text: string };

export function AccountSettingsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'AccountSettings'>) {
  const { activeAccount } = useAuth();
  const t = useT();
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
      setEmailError(messages().common.required);
      return;
    }
    if (mail.length > EMAIL_MAX || !EMAIL_PATTERN.test(mail)) {
      setEmailError(messages().common.invalidEmail);
      return;
    }
    setEmailError(undefined);
    pendingEmail.current = mail;
    setAskPin(true);
  };

  /** After the MPIN: is a change allowed now, and is the address free? Only then is an SMS sent. */
  const checkPin = async (value: string): Promise<string | null> => {
    if (!phone) return messages().common.noPhone;
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
        title: messages().common.tryLater,
        text:
          availability.email.reason === 'reset'
            ? messages().accountSettings.resetHold(formatWait(availability.email.retryAfter))
            : messages().accountSettings.recentChange(formatWait(availability.email.retryAfter)),
      });
      return null;
    }
    if (availability.emailTaken) {
      setEmailError(messages().accountSettings.emailTaken);
      return null;
    }
    pin.current = value;
    setSmsRound((n) => n + 1);
    setStep('sms');
    return null;
  };

  const save = async (proof: string) => {
    if (!phone) return;
    const controller = new AbortController();
    request.current = controller;
    setStep('saving');
    try {
      await updateProfile(phone, pin.current, { email: pendingEmail.current }, proof, controller.signal);
    } catch (e) {
      if (isAborted(e) || !mounted.current) return;
      if (e instanceof ApiError && e.status === 409) {
        setEmailError(fieldErrorText(e) ?? messages().accountSettings.emailTaken);
        backToForm(null);
      } else if (isChangeCooldown(e)) {
        backToForm({ tone: 'warning', title: messages().common.tryLater, text: errorMessage(e) });
      } else if (needsSmsCode(e)) {
        setSmsRound((n) => n + 1);
        setStep('sms');
      } else if (e instanceof ApiError && e.status === 400) {
        setEmailError(fieldErrorText(e) ?? errorMessage(e));
        backToForm(null);
      } else {
        backToForm({ tone: 'error', title: messages().accountSettings.notSaved, text: pinErrorMessage(e) });
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
      <SettingsPage title="Account Settings" subtitle={t.forgotMpin.smsSubtitle} onBack={() => backToForm(null)}>
        {step === 'saving' ? (
          <Text style={styles.saving} accessibilityLiveRegion="polite">
            {t.accountSettings.saving}
          </Text>
        ) : (
          <SmsCodeStep key={smsRound} phone={phone} purpose="change_email" onVerified={(proof) => void save(proof)} />
        )}
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Account Settings" subtitle={t.accountSettings.subtitle} onBack={navigation.goBack}>
      {/* Changes at once, with no MPIN: it only affects how the app reads on this phone. */}
      <View style={styles.language}>
        <Text style={styles.languageTitle} accessibilityRole="header">
          {t.language.title}
        </Text>
        <LanguageSwitch />
        <Text style={styles.note}>{t.language.hint}</Text>
      </View>
      <Notice tone="info">{t.accountSettings.notice}</Notice>
      <View style={styles.form}>
        <TextField
          label={t.accountSettings.newEmail}
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
          <Fact label={t.accountSettings.name} value={fullName(activeAccount)} />
          <Fact label={t.onboarding.mobileNumber} value={phone ? formatPhoneDisplay(phone) : t.accountSettings.notAvailable} />
          <Fact label="Short ID" value={activeAccount?.shortId ?? ''} />
          <Text style={styles.note}>{t.accountSettings.cannotChange}</Text>
        </View>
      </View>

      {message ? (
        <Notice tone={message.tone} title={message.title}>
          {message.text}
        </Notice>
      ) : null}
      {saved ? (
        <Text style={styles.success} accessibilityLiveRegion="polite">
          {t.accountSettings.saved}
        </Text>
      ) : null}
      <Button label={t.accountSettings.save} size="large" onPress={review} />

      <PinDialog
        visible={askPin}
        title={t.common.confirmMpinTitle}
        message={t.accountSettings.pinMessage}
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
  language: { gap: 8 },
  languageTitle: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  facts: { marginTop: 8, gap: 10 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  factLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },
  factValue: { flexShrink: 1, textAlign: 'right', fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  note: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  success: { fontFamily: fonts.medium, fontSize: 15, color: colors.success, textAlign: 'center' },
  saving: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted, textAlign: 'center' },
});
