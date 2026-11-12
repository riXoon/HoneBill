import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/ui/Button';
import { PinDialog } from '../components/ui/PinDialog';
import { SettingsPage } from '../components/ui/SettingsPage';
import { TextField } from '../components/ui/TextField';
import { fullName, useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { formatPhoneDisplay } from '../services/accountPhone';
import { ApiError, errorMessage } from '../services/api/client';
import { updateProfile } from '../services/api/users';
import { fieldErrorText } from '../services/completeSignup';
import { pinErrorMessage } from '../services/pinErrors';
import { colors, fonts } from '../theme';

const REQUIRED = 'Input is required';
const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AccountSettingsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'AccountSettings'>) {
  const { activeAccount } = useAuth();
  // The server never sends the email back, so the field starts empty.
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [askPin, setAskPin] = useState(false);
  const [saved, setSaved] = useState(false);
  const pendingEmail = useRef('');
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const phone = activeAccount?.phone ?? null;

  const review = () => {
    setSaved(false);
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

  const save = async (pin: string): Promise<string | null> => {
    if (!phone) return 'This account has no phone number on this device.';
    try {
      await updateProfile(phone, pin, { email: pendingEmail.current });
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) return fieldErrorText(e) ?? errorMessage(e);
      return pinErrorMessage(e);
    }
    if (mounted.current) {
      setAskPin(false);
      setEmail('');
      setSaved(true);
    }
    return null;
  };

  return (
    <SettingsPage title="Account Settings" subtitle="You can update the email on your account." onBack={navigation.goBack}>
      <View style={styles.form}>
        <TextField
          label="New email address"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setSaved(false);
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

      {saved ? (
        <Text style={styles.success} accessibilityLiveRegion="polite">
          Saved! Your email is updated.
        </Text>
      ) : null}
      <Button label="Save email" size="large" onPress={review} />

      <PinDialog
        visible={askPin}
        title="Confirm with your MPIN"
        message="Enter your 4-digit MPIN to save your new email."
        onSubmit={save}
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
  factLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
  factValue: { flexShrink: 1, textAlign: 'right', fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  note: { fontFamily: fonts.light, fontSize: 11, color: colors.textMuted },
  success: { fontFamily: fonts.medium, fontSize: 13, color: colors.success, textAlign: 'center' },
});
