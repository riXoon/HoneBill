import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Mascot } from '../components/mascot/Mascot';
import { AppBackground } from '../components/ui/AppBackground';
import { AuthChrome } from '../components/ui/AuthChrome';
import { Button } from '../components/ui/Button';
import { GradientTitle } from '../components/ui/GradientTitle';
import type { RootStackParamList } from '../navigation/types';
import { setAccountPhone } from '../services/accountPhone';
import { errorMessage, isAborted } from '../services/api/client';
import { sendOtp } from '../services/api/otp';
import { checkUser } from '../services/api/users';
import { colors, fonts, radius } from '../theme';

// Figma: Input Number (870:3025), 402x874.
const COUNTRY_CODE = '+63';
const PHONE_LENGTH = 10;

export function InputNumberScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'InputNumber'>) {
  // `signin` reuses this screen to find an existing account (the MPIN is the check, so no OTP).
  const signin = route.params?.mode === 'signin';
  const [phone, setPhone] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  const submit = async () => {
    if (busy) return;
    if (phone.length !== PHONE_LENGTH) {
      setInvalid(true);
      return;
    }

    const fullPhone = `${COUNTRY_CODE}${phone}`;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      // Checking first saves an SMS and tells the user now, not at the end of sign-up, that the number is taken.
      const account = await checkUser(fullPhone, controller.signal);
      if (signin) {
        if (!account.exists) {
          setError('No account found for this number.');
          return;
        }
        await setAccountPhone(fullPhone);
        navigation.popTo('Login');
        return;
      }
      if (account.exists) {
        setError('This number already has an account. Go back and sign in.');
        return;
      }
      await sendOtp(fullPhone, controller.signal);
      navigation.navigate('Otp', { phone: fullPhone });
    } catch (e) {
      if (!isAborted(e)) setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppBackground />
      <AuthChrome step={signin ? undefined : 1} onBack={navigation.goBack} />

      <View style={styles.content}>
        <View style={styles.titleBlock}>
          <GradientTitle size={30}>Enter your phone number</GradientTitle>
          <Text style={styles.subtitle}>
            {signin
              ? 'Enter the mobile number linked to your HoneBill account'
              : 'Link your mobile number to set up your online and offline accounts'}
          </Text>
        </View>

        <View style={styles.formBlock}>
          <View style={styles.row}>
            <View style={[styles.box, styles.code]}>
              <Text style={styles.codeText}>{COUNTRY_CODE}</Text>
            </View>
            <TextInput
              value={phone}
              onChangeText={(t) => {
                setPhone(t.replace(/\D/g, '').slice(0, PHONE_LENGTH));
                setInvalid(false);
                setError(null);
              }}
              placeholder="9123456789"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              accessibilityLabel="Mobile number"
              editable={!busy}
              style={[styles.box, styles.field, (invalid || error) && styles.invalid]}
            />
          </View>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>

        <Button
          label={busy ? 'Please wait…' : signin ? 'Continue' : 'Send OTP'}
          size="large"
          onPress={() => void submit()}
          disabled={busy}
        />

        <View style={styles.mascotSlot}>
          <Mascot mood="phone" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: 40, gap: 40 },
  titleBlock: { gap: 8 },
  subtitle: { width: 300, fontFamily: fonts.light, fontSize: 13, color: colors.textMuted },
  formBlock: { gap: 10 },
  row: { flexDirection: 'row', gap: 8 },
  box: {
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceTranslucent,
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  code: { width: 72, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontFamily: fonts.regular, fontSize: 14, color: colors.primary },
  field: { flex: 1, paddingHorizontal: 16, color: colors.text },
  invalid: { borderColor: colors.coral },
  error: { fontFamily: fonts.regular, fontSize: 12, color: colors.coral },
  mascotSlot: { height: 292, alignItems: 'center', justifyContent: 'center' },
});
