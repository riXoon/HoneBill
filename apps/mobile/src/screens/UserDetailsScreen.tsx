import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { Button } from '../components/ui/Button';
import { GradientTitle } from '../components/ui/GradientTitle';
import { TextField } from '../components/ui/TextField';
import type { RootStackParamList } from '../navigation/types';
import { getSignupSession, setSignupDetails } from '../services/signupSession';
import { colors, fonts } from '../theme';

// Figma: User Details (870:3010), 402x874.
const REQUIRED = 'Input is required';
/** Same limits the server enforces, so a bad value is caught here and not after the MPIN step. */
const NAME_MAX = 50;
const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = { firstName?: string; lastName?: string; email?: string };

export function UserDetailsScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'UserDetails'>) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const submit = () => {
    const first = firstName.trim();
    const last = lastName.trim();
    const mail = email.trim();
    const next: Errors = {};
    if (!first) next.firstName = REQUIRED;
    else if (first.length > NAME_MAX) next.firstName = `At most ${NAME_MAX} characters`;
    if (!last) next.lastName = REQUIRED;
    else if (last.length > NAME_MAX) next.lastName = `At most ${NAME_MAX} characters`;
    if (!mail) next.email = REQUIRED;
    else if (mail.length > EMAIL_MAX || !EMAIL_PATTERN.test(mail)) next.email = 'Enter a valid email address';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // The session only exists after a verified OTP; without it the account cannot be registered.
    if (!getSignupSession()) {
      navigation.popTo('InputNumber');
      return;
    }
    setSignupDetails({ firstName: first, lastName: last, email: mail });
    navigation.navigate('MpinCreation');
  };

  return (
    <View style={styles.root}>
      <AppBackground />
      <AuthChrome step={3} onBack={navigation.goBack} />

      <View style={styles.content}>
        <View style={styles.header}>
          <GradientTitle>User Details</GradientTitle>
          <Text style={styles.subtitle}>Enter details to complete registration</Text>
        </View>

        <View style={styles.fields}>
          <TextField
            label="First name"
            value={firstName}
            onChangeText={setFirstName}
            error={errors.firstName}
            autoCapitalize="words"
            textContentType="givenName"
          />
          <TextField
            label="Last name"
            value={lastName}
            onChangeText={setLastName}
            error={errors.lastName}
            autoCapitalize="words"
            textContentType="familyName"
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
        </View>

        <View style={styles.spacer} />
        <Button label="Continue" size="large" onPress={submit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  // 60 dp spacer under the back button, then the header, as in the design.
  content: { flex: 1, paddingHorizontal: 40, paddingTop: 100, paddingBottom: 40, gap: 40 },
  header: { gap: 10 },
  subtitle: { fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  fields: { alignItems: 'center', gap: 12 },
  spacer: { flex: 1 },
});
