import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/ui/Button';
import { PinDialog } from '../components/ui/PinDialog';
import { SettingsPage } from '../components/ui/SettingsPage';
import { TextField } from '../components/ui/TextField';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { formatPhoneDisplay } from '../services/accountPhone';
import { ApiError, errorMessage } from '../services/api/client';
import { updateProfile, type ProfileChanges } from '../services/api/users';
import { fieldErrorText } from '../services/completeSignup';
import { pinErrorMessage } from '../services/pinErrors';
import { colors, fonts } from '../theme';

const REQUIRED = 'Input is required';
const NAME_MAX = 50;
const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = { firstName?: string; lastName?: string; email?: string };

export function AccountSettingsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'AccountSettings'>) {
  const { activeAccount, updateAccount } = useAuth();
  const [firstName, setFirstName] = useState(activeAccount?.firstName ?? '');
  const [lastName, setLastName] = useState(activeAccount?.lastName ?? '');
  // The server never sends the email back, so the field starts empty and an empty field leaves it unchanged.
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [askPin, setAskPin] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef<ProfileChanges>({});
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const phone = activeAccount?.phone ?? null;

  const review = () => {
    setSaved(false);
    const first = firstName.trim();
    const last = lastName.trim();
    const mail = email.trim();
    const next: Errors = {};
    if (!first) next.firstName = REQUIRED;
    else if (first.length > NAME_MAX) next.firstName = `At most ${NAME_MAX} characters`;
    if (!last) next.lastName = REQUIRED;
    else if (last.length > NAME_MAX) next.lastName = `At most ${NAME_MAX} characters`;
    if (mail && (mail.length > EMAIL_MAX || !EMAIL_PATTERN.test(mail))) next.email = 'Enter a valid email address';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const changes: ProfileChanges = {};
    if (first !== activeAccount?.firstName) changes.firstName = first;
    if (last !== activeAccount?.lastName) changes.lastName = last;
    if (mail) changes.email = mail;
    if (Object.keys(changes).length === 0) {
      setErrors({ firstName: 'Nothing to save yet. Change a field first.' });
      return;
    }
    pending.current = changes;
    setAskPin(true);
  };

  const save = async (pin: string): Promise<string | null> => {
    if (!phone) return 'This account has no phone number on this device.';
    try {
      await updateProfile(phone, pin, pending.current);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) return fieldErrorText(e) ?? errorMessage(e);
      return pinErrorMessage(e);
    }
    const { firstName: first, lastName: last } = pending.current;
    await updateAccount({ ...(first ? { firstName: first } : {}), ...(last ? { lastName: last } : {}) });
    if (mounted.current) {
      setAskPin(false);
      setEmail('');
      setSaved(true);
    }
    return null;
  };

  return (
    <SettingsPage title="Account Settings" subtitle="Update the name and email on your account." onBack={navigation.goBack}>
      <View style={styles.form}>
        <TextField
          label="First name"
          value={firstName}
          onChangeText={setFirstName}
          autoComplete="name-given"
          textContentType="givenName"
          error={errors.firstName}
        />
        <TextField
          label="Last name"
          value={lastName}
          onChangeText={setLastName}
          autoComplete="name-family"
          textContentType="familyName"
          error={errors.lastName}
        />
        <TextField
          label="Email (leave empty to keep the current one)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          error={errors.email}
        />

        <View style={styles.facts}>
          <Fact label="Mobile number" value={phone ? formatPhoneDisplay(phone) : 'Not available'} />
          <Fact label="Short ID" value={activeAccount?.shortId ?? ''} />
          <Text style={styles.note}>Your number and Short ID cannot be changed here.</Text>
        </View>
      </View>

      {saved ? (
        <Text style={styles.success} accessibilityLiveRegion="polite">
          Saved! Your details are updated.
        </Text>
      ) : null}
      <Button label="Save changes" size="large" onPress={review} />

      <PinDialog
        visible={askPin}
        title="Confirm with your MPIN"
        message="Enter your 4-digit MPIN to save these changes."
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
  factValue: { fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  note: { fontFamily: fonts.light, fontSize: 11, color: colors.textMuted },
  success: { fontFamily: fonts.medium, fontSize: 13, color: colors.success, textAlign: 'center' },
});
